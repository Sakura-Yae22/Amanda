const Client = require("cloudstorm")
const fetchdefault = require("node-fetch").default
/** @type {fetchdefault} */
// @ts-ignore
const fetch = require("node-fetch")
const util = require("util")
const repl = require("repl")

const AmpqpConnector = require("raincache").Connectors.AmqpConnector

const config = require("../config")
const BaseWorkerServer = require("../modules/structures/BaseWorkerServer")

const Gateway = new Client(config.bot_token, {
	intents: ["DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS", "GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_VOICE_STATES"],
	firstShardId: config.shard_list[0],
	shardAmount: config.total_shards,
	lastShardId: config.shard_list[config.shard_list.length - 1],
	reconnect: true
})

const worker = new BaseWorkerServer("gateway", config.redis_password)

const presence = {}

/**
 * @type {import("thunderstorm/typings/internal").InboundDataType<"READY">}
 */
let readyPayload = {}

const connection = new AmpqpConnector({
	amqpUrl: `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`
});

(async () => {
	await connection.initialize()
	await Gateway.connect()
	console.log("Gateway initialized.")

	connection.channel.assertQueue(config.amqp_data_queue, { durable: false, autoDelete: true })

	/**
	 * @param {string} input
	 * @param {import("vm").Context} context
	 * @param {string} filename
	 * @param {(err: Error|null, result: any) => any} callback
	 */
	async function customEval(input, context, filename, callback) {
		let depth = 0
		if (input == "exit\n") return process.exit()
		if (input.startsWith(":")) {
			const depthOverwrite = input.split(" ")[0]
			depth = +depthOverwrite.slice(1)
			input = input.slice(depthOverwrite.length + 1)
		}
		const result = await eval(input)
		const output = util.inspect(result, false, depth, true)
		return callback(undefined, output)
	}

	const cli = repl.start({ prompt: "> ", eval: customEval, writer: s => s })

	Object.assign(cli.context, { Gateway, worker, presence, readyPayload, connection })

	cli.once("exit", () => {
		process.exit()
	})

	Gateway.on("debug", console.log)
	Gateway.on("error", console.error)

	Gateway.on("event", data => {
		if (data.t === "READY") readyPayload = data
		// Send data (Gateway -> Cache)
		const d = JSON.stringify(data)
		fetch(`${config.cache_server_protocol}://${config.cache_server_domain}/gateway`, { body: d, headers: { authorization: config.redis_password }, method: "POST" })
		connection.channel.sendToQueue(config.amqp_data_queue, Buffer.from(d))
	})

	worker.get("/stats", (request, response) => {
		return response.status(200).send(worker.createDataResponse({ ram: process.memoryUsage(), uptime: process.uptime(), shards: Object.values(Gateway.shardManager.shards).map(s => s.id) })).end()
	})

	worker.get("/login", (request, response) => {
		console.log(`Client logged in at ${new Date().toUTCString()}`)
		return response.status(200).send(worker.createDataResponse(readyPayload)).end()
	})


	worker.patch("/status-update", (request, response) => {
		if (!request.body) return response.status(204).send(worker.createErrorResponse("No payload")).end()
		/** @type {import("../typings").GatewayStatusUpdateData} */
		const data = request.body
		if (!data.name && !data.status && !data.type && !data.url) return response.status(406).send(worker.createErrorResponse("Missing all status update fields")).end()

		const payload = {}
		const game = {}
		if (data.name !== undefined) game["name"] = data.name
		if (data.type !== undefined) game["type"] = data.type
		if (data.url !== undefined) game["url"] = data.url
		if (data.status !== undefined) payload["status"] = data.status

		if (game.name || game.type || game.url) payload["activities"] = [game]

		if (payload.game && payload.game.name && payload.game.type === undefined) payload.game.type = 0

		Object.assign(presence, payload)

		response.status(200).send(worker.createDataResponse(presence)).end()

		Gateway.shardManager.presenceUpdate(payload)
	})


	worker.post("/send-message", async (request, response) => {
		if (!request.body) return response.status(204).send(worker.createErrorResponse("No payload")).end()
		/** @type {import("lavacord").DiscordPacket} */
		const data = request.body

		const sid = Number((BigInt(data.d.guild_id) >> BigInt(22)) % BigInt(config.shard_list.length))
		const shard = Object.values(Gateway.shardManager.shards).find(s => s.id === sid)
		if (shard) {
			try {
				await shard.connector.betterWs.sendMessage(data)
			} catch {
				return response.status(500).send(worker.createErrorResponse(`Unable to send message\nMessage: ${JSON.stringify(data)}`)).end()
			}
			response.status(200).send(worker.createDataResponse("Message sent")).end()
		} else {
			console.log(`No shard found to send WS Message:\n${require("util").inspect(data, true, 2, true)}`)
			response.status(500).send(worker.createErrorResponse(`Unable to send message\nMessage: ${JSON.stringify(data)}`)).end()
		}
	})
})().catch(console.error)

process.on("unhandledRejection", console.error)