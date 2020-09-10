// @ts-check

const RainCache = require("raincache")

const AmpqpConnector = RainCache.Connectors.AmqpConnector
const RedisStorageEngine = RainCache.Engines.RedisStorageEngine

const config = require("./config")

const connection = new AmpqpConnector({
	amqpUrl: `amqp://${config.amqp_username}:${config.redis_password}@${config.amqp_origin}:${config.amqp_port}/amanda-vhost`
})

// @ts-ignore
const rain = new RainCache({
	storage: {
		default: new RedisStorageEngine({
			redisOptions: {
				host: config.amqp_origin,
				password: config.redis_password
			}
		})
	},
	debug: false
}, connection, connection);

(async () => {
	await rain.initialize()
	console.log("Cache initialized.")

	connection.channel.assertQueue(config.amqp_gateway_queue, { durable: false, autoDelete: true })
	connection.channel.assertQueue(config.amqp_cache_queue, { durable: false, autoDelete: true })
	connection.channel.assertQueue(config.amqp_client_request_queue, { durable: false, autoDelete: true })

	connection.channel.consume(config.amqp_gateway_queue, async message => {
		connection.channel.ack(message)

		/** @type {import("thunderstorm/typings/internal").InboundDataType<keyof import("thunderstorm/typings/internal").CloudStormEventDataTable>} */
		const data = JSON.parse(message.content.toString())
		await handleCache(data)
		/** @type {import("./typings").InboundData} */
		// @ts-ignore
		const payload = {
			from: "GATEWAY",
			data: data,
			time: new Date().toUTCString()
		}
		connection.channel.sendToQueue(config.amqp_cache_queue, Buffer.from(JSON.stringify(payload)))
	})

	connection.channel.consume(config.amqp_client_request_queue, async message => {
		connection.channel.ack(message)

		/** @type {import("./typings").ActionRequestData<keyof import("./typings").ActionEvents>} */
		const data = JSON.parse(message.content.toString())


		if (data.event === "CACHE_REQUEST_DATA") {
			/** @type {import("./typings").ActionRequestData<"CACHE_REQUEST_DATA">} */
			// @ts-ignore
			const typed = data

			/** @type {import("./typings").InboundData} */
			// @ts-ignore
			const payload = {
				from: "CACHE"
			}


			if (typed.data.op === "FIND_GUILD") {
				/** @type {{ id?: string, name?: string }} */
				// @ts-ignore
				const query = typed.data.params || {}
				const members = await rain.cache.guild.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				let match
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					const guilds = await Promise.all(batch.map(id => rain.cache.guild.get(id)))

					for (const guild of guilds) {
						if (match) continue
						const obj = guild && guild.boundObject ? guild.boundObject : (guild || {})

						if (query.id && obj.id === query.id) {
							end()
							continue
						} else if (query.name && (obj.name ? obj.name.toLowerCase().includes(query.name.toLowerCase()) : false)) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							match = obj
							passing = false
						}
					}
					pass++
				}
				payload.data = match || null

			} else if (typed.data.op === "FILTER_GUILDS") {
				/** @type {{ id?: string, name?: string, limit?: number }} */
				// @ts-ignore
				const query = typed.data.params || { limit: 10 }
				const members = await rain.cache.guild.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				const matched = []
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					const guilds = await Promise.all(batch.map(id => rain.cache.guild.get(id)))

					for (const guild of guilds) {
						if (!passing) continue
						if (query.limit && matched.length === query.limit) {
							passing = false
							continue
						}
						const obj = guild && guild.boundObject ? guild.boundObject : (guild || {})

						if (!query.id && !query.name) {
							end()
							continue
						} else if (obj.id === query.id) {
							end()
							continue
						} else if (obj.name === (obj.name ? obj.name.toLowerCase().includes(query.name.toLowerCase()) : false)) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							matched.push(obj)
						}
					}
					pass++
				}
				payload.data = matched


			} else if (typed.data.op === "FIND_CHANNEL") {
				/** @type {{ id?: string, name?: string, guild_id?: string }} */
				const query = typed.data.params || {}
				const members = await rain.cache.channel.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				let match
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					const channels = await Promise.all(batch.map(id => rain.cache.channel.get(id)))

					for (const channel of channels) {
						if (match) continue
						const obj = channel && channel.boundObject ? channel.boundObject : (channel || {})

						if (query.guild_id && obj.guild_id != query.guild_id) continue

						if (query.id && obj.id === query.id) {
							end()
							continue
						} else if (query.name && (obj.name ? obj.name.toLowerCase().includes(query.name.toLowerCase()) : false)) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							match = obj
							passing = false
						}
					}
					pass++
				}
				payload.data = match || null

			} else if (typed.data.op === "FILTER_CHANNELS") {
				/** @type {{ id?: string, name?: string, guild_id?: string, limit?: number }} */
				const query = typed.data.params || { limit: 10 }
				const members = await rain.cache.channel.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				const matched = []
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					const channels = await Promise.all(batch.map(id => rain.cache.channel.get(id)))

					for (const channel of channels) {
						if (!passing) continue
						if (query.limit && matched.length === query.limit) {
							passing = false
							continue
						}
						const obj = channel && channel.boundObject ? channel.boundObject : (channel || {})

						if (query.guild_id && obj.guild_id != query.guild_id) continue

						if (!query.id && !query.name && !query.guild_id) {
							end()
							continue
						} if (query.id && obj.id === query.id) {
							end()
							continue
						} else if (query.name && (obj.name ? obj.name.toLowerCase().includes(query.name.toLowerCase()) : false)) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							matched.push(obj)
						}
					}
					pass++
				}
				payload.data = matched


			} else if (typed.data.op === "FIND_USER") {
				/** @type {{ id?: string, username?: string, discriminator?: string, tag?: string }} */
				// @ts-ignore
				const query = typed.data.params || {}
				const members = await rain.cache.user.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				let match
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					const users = await Promise.all(batch.map(id => rain.cache.user.get(id)))

					for (const user of users) {
						if (match) continue
						const obj = user && user.boundObject ? user.boundObject : (user || {})

						if (query.id && obj.id === query.id) {
							end()
							continue
						} else if (query.username && (obj.username ? obj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
							end()
							continue
						} else if (query.discriminator && obj.discriminator === query.discriminator) {
							end()
							continue
						} else if (query.tag && (obj.username && obj.discriminator ? `${obj.username}#${obj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							match = obj
							passing = false
						}
					}
					pass++
				}
				payload.data = match || null

			} else if (typed.data.op === "FILTER_USERS") {
				/** @type {{ id?: string, username?: string, discriminator?: string, tag?: string, limit?: number }} */
				// @ts-ignore
				const query = typed.data.params || { limit: 10 }
				const members = await rain.cache.user.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				const matched = []
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					const users = await Promise.all(batch.map(id => rain.cache.user.get(id)))

					for (const user of users) {
						if (!passing) continue
						if (query.limit && matched.length === query.limit) {
							passing = false
							continue
						}
						const obj = user && user.boundObject ? user.boundObject : (user || {})

						if (!query.id && !query.username && !query.discriminator && !query.tag) {
							end()
							continue
						} else if (query.id && obj.id === query.id) {
							end()
							continue
						} else if (query.username && (obj.username ? obj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
							end()
							continue
						} else if (query.discriminator && obj.discriminator === query.discriminator) {
							end()
							continue
						} else if (query.tag && (obj.username && obj.discriminator ? `${obj.username}#${obj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							matched.push(obj)
						}
					}
					pass++
				}
				payload.data = matched


			} else if (typed.data.op === "FIND_MEMBER") {
				/** @type {{ id?: string, username?: string, discriminator?: string, tag?: string, nick?: string, guild_id?: string }} */
				const query = typed.data.params || {}
				/** @type {Array<string>} */
				let members
				if (query.guild_id) members = await rain.cache.member.getIndexMembers(query.guild_id)
				else members = await rain.cache.member.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				let match
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					let mems
					if (query.guild_id) mems = await Promise.all(batch.map(id => rain.cache.member.get(id, query.guild_id)))
					else mems = await Promise.all(batch.map(id => rain.cache.member.get(id)))

					for (const member of mems) {
						if (match) continue
						const mobj = member && member.boundObject ? member.boundObject : (member || {})
						const user = await rain.cache.user.get(mobj.id)
						const uobj = user && user.boundObject ? user.boundObject : (user || {})

						if (query.guild_id && mobj.guild_id != query.guild_id) continue

						if (query.id && mobj.id === query.id) {
							end()
							continue
						} else if (query.username && (uobj.username ? uobj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
							end()
							continue
						} else if (query.discriminator && uobj.discriminator === query.discriminator) {
							end()
							continue
						} else if (query.tag && (uobj.username && uobj.discriminator ? `${uobj.username}#${uobj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
							end()
							continue
						} else if (query.nick && (mobj.nick ? mobj.nick.toLowerCase().includes(query.nick.toLowerCase()) : false)) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							match = { user: uobj, ...mobj }
							passing = false
						}
					}
					pass++
				}
				payload.data = match || null

			} else if (typed.data.op === "FILTER_MEMBERS") {
				/** @type {{ id?: string, username?: string, discriminator?: string, tag?: string, nick?: string, guild_id?: string, limit?: number }} */
				const query = typed.data.params || { limit: 10 }
				/** @type {Array<string>} */
				let members
				if (query.guild_id) members = await rain.cache.member.getIndexMembers(query.guild_id)
				else members = await rain.cache.member.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				const matched = []
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					let mems
					if (query.guild_id) mems = await Promise.all(batch.map(id => rain.cache.member.get(id, query.guild_id)))
					else mems = await Promise.all(batch.map(id => rain.cache.member.get(id)))

					for (const member of mems) {
						if (!passing) continue
						if (query.limit && matched.length === query.limit) {
							passing = false
							continue
						}
						const mobj = member && member.boundObject ? member.boundObject : (member || {})
						const user = await rain.cache.user.get(mobj.id)
						const uobj = user && user.boundObject ? user.boundObject : (user || {})

						if (query.guild_id && mobj.guild_id != query.guild_id) continue

						if (!query.id && !query.username && !query.discriminator && !query.tag && !query.guild_id && !query.nick) {
							end()
							continue
						} if (query.id && mobj.id === query.id) {
							end()
							continue
						} else if (query.username && (uobj.username ? uobj.username.toLowerCase().includes(query.username.toLowerCase()) : false)) {
							end()
							continue
						} else if (query.discriminator && uobj.discriminator === query.discriminator) {
							end()
							continue
						} else if (query.tag && (uobj.username && uobj.discriminator ? `${uobj.username}#${uobj.discriminator}`.toLowerCase() === query.tag.toLowerCase() : false)) {
							end()
							continue
						} else if (query.nick && (mobj.nick ? mobj.nick.toLowerCase().includes(query.nick.toLowerCase()) : false)) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							matched.push({ user: uobj, ...mobj })
						}
					}
					pass++
				}
				payload.data = matched


			} else if (typed.data.op === "FIND_VOICE_STATE") {
				/** @type {{ channel_id?: string, user_id?: string, guild_id?: string }} */
				// @ts-ignore
				const query = typed.data.params || {}
				/** @type {Array<string>} */
				const members = await rain.cache.voiceState.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				let match
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					const states = await Promise.all(batch.map(id => rain.cache.voiceState.get(id, query.guild_id)))

					for (const state of states) {
						if (match) continue
						const sobj = state && state.boundObject ? state.boundObject : (state || {})
						const user = await rain.cache.user.get(state.user_id)
						const uobj = user && user.boundObject ? user.boundObject : (user || {})

						if (query.guild_id && sobj.guild_id != query.guild_id) continue

						if (query.channel_id && sobj.channel_id === query.channel_id) {
							end()
							continue
						} else if (query.user_id && sobj.user_id === query.user_id) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							match = { user: uobj, ...sobj }
							passing = false
						}
					}
					pass++
				}
				payload.data = match || null

			} else if (typed.data.op === "FILTER_VOICE_STATES") {
				/** @type {{ channel_id?: string, user_id?: string, guild_id?: string, limit?: number }} */
				// @ts-ignore
				const query = typed.data.params || { limit: 10 }
				/** @type {Array<string>} */
				const members = await rain.cache.voiceState.getIndexMembers()
				const batchLimit = 50
				let pass = 1
				let passing = true
				const matched = []
				while (passing) {
					const starting = (batchLimit * pass) - batchLimit
					const batch = members.slice(starting, starting + batchLimit)

					if (batch.length === 0) {
						passing = false
						continue
					}

					const states = await Promise.all(batch.map(id => rain.cache.voiceState.get(id, query.guild_id)))

					for (const state of states) {
						if (!passing) continue
						if (query.limit && matched.length === query.limit) {
							passing = false
							continue
						}
						if (!state) continue
						const sobj = state && state.boundObject ? state.boundObject : (state || {})
						const user = await rain.cache.user.get(sobj.user_id)
						const uobj = user && user.boundObject ? user.boundObject : (user || {})

						if (query.guild_id && sobj.guild_id != query.guild_id) continue

						if (!query.channel_id && !query.user_id) {
							end()
							continue
						} if (query.channel_id && sobj.channel_id === query.channel_id) {
							end()
							continue
						} else if (query.user_id && sobj.user_id === query.user_id) {
							end()
							continue
						} else {
							continue
						}

						// eslint-disable-next-line no-inner-declarations
						function end() {
							matched.push({ user: uobj, ...sobj })
						}
					}
					pass++
				}
				payload.data = matched

			}


			payload.time = new Date().toUTCString()
			payload.threadID = typed.data.threadID
			connection.channel.sendToQueue(config.amqp_cache_queue, Buffer.from(JSON.stringify(payload)))

		} else if (data.event === "CACHE_SAVE_DATA") {
			/** @type {import("./typings").ActionRequestData<"CACHE_SAVE_DATA">} */
			// @ts-ignore
			const typed = data.data
		}
	})
})()

/**
 * We obviously want to wait for the cache ops to complete because most of the code still runs under the assumption
 * that rain AT LEAST has some data regarding an entity. I would hate to fetch info about something if we would have
 * just waited for cache ops to finish actually caching things for the worker to be able to access.
 * @param {import("thunderstorm/typings/internal").InboundDataType<keyof import("thunderstorm/typings/internal").CloudStormEventDataTable>} event
 */
async function handleCache(event) {
	if (event.t === "GUILD_CREATE") {
		// @ts-ignore
		await rain.cache.guild.update(event.d.id, event.d) // Rain apparently handles members and such

	// @ts-ignore
	} else if (event.t === "GUILD_UPDATE") await rain.cache.guild.update(event.d.id, event.d)

	else if (event.t === "GUILD_DELETE") {
		// @ts-ignore
		if (!event.d.unavailable) await rain.cache.guild.remove(event.d.id) // Rain apparently also handles deletion of everything in a guild

	// @ts-ignore
	} else if (event.t === "CHANNEL_CREATE") await rain.cache.channel.update(event.d.id, event.d) // Rain handles permission_overwrites

	// @ts-ignore
	else if (event.t === "CHANNEL_UPDATE") await rain.cache.channel.update(event.d.id, event.d)

	// @ts-ignore
	else if (event.t === "CHANNEL_DELETE") {
		// @ts-ignore
		if (!event.d.guild_id) return
		// @ts-ignore
		await rain.cache.channel.remove(event.d.channel_id)

	} else if (event.t === "MESSAGE_CREATE") {
		/** @type {import("@amanda/discordtypings").MessageData} */
		// @ts-ignore
		const typed = event.d

		if (typed.member && typed.author) await rain.cache.member.update(typed.author.id, typed.guild_id, { guild_id: typed.guild_id, user: typed.author, id: typed.author.id, ...typed.member })
		else if (typed.author) await rain.cache.user.update(typed.author.id, typed.author)

		if (typed.mentions && typed.mentions.length > 0 && typed.guild_id) {
			await Promise.all(typed.mentions.map(user => {
				// @ts-ignore
				if (user.member) rain.cache.member.update(user.id, typed.guild_id, user.member)
				else rain.cache.user.update(user.id, user)
			}))
		}

	} else if (event.t === "VOICE_STATE_UPDATE") {
		/** @type {import("@amanda/discordtypings").VoiceStateData} */
		// @ts-ignore
		const typed = event.d
		if (!typed.guild_id) return
		// @ts-ignore
		if (typed.member && typed.user_id && typed.guild_id) await rain.cache.member.update(typed.user_id, typed.guild_id, { guild_id: typed.guild_id, ...typed.member })

		if (typed.channel_id) await rain.cache.voiceState.update(typed.user_id, typed.guild_id, typed)
		else await rain.cache.voiceState.remove(typed.user_id, typed.guild_id)

	} else if (event.t === "GUILD_MEMBER_UPDATE") {
		/** @type {import("@amanda/discordtypings").MemberData & { user: import("@amanda/discordtypings").UserData } & { guild_id: string }} */
		// @ts-ignore
		const typed = event.d
		// @ts-ignore
		await rain.cache.member.update(typed.user.id, typed.guild_id, typed) // This should just only be the ClientUser unless the GUILD_MEMBERS intent is passed

	} else if (event.t === "GUILD_ROLE_CREATE") {
		/** @type {{ guild_id: string, role: import("@amanda/discordtypings").RoleData }} */
		// @ts-ignore
		const typed = event.d
		// @ts-ignore
		await rain.cache.role.update(typed.role.id, typed.guild_id, typed.role)

	} else if (event.t === "GUILD_ROLE_UPDATE") {
		/** @type {{ guild_id: string, role: import("@amanda/discordtypings").RoleData }} */
		// @ts-ignore
		const typed = event.d
		// @ts-ignore
		await rain.cache.role.update(typed.role.id, typed.guild_id, typed.role)

	} else if (event.t === "GUILD_ROLE_DELETE") {
		// @ts-ignore
		await rain.cache.role.remove(event.d.role_id, event.d.guild_id)
	}
}