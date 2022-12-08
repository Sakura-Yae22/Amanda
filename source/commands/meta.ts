/* eslint-disable @typescript-eslint/ban-ts-comment */

import sG from "simple-git"
const simpleGit = sG(__dirname)

import passthrough from "../passthrough"
const { client, constants, config, commands, sync, requester, queues } = passthrough

const text = sync.require("../utils/string") as typeof import("../utils/string")
const emojis = sync.require("../emojis") as typeof import("../emojis")
const language = sync.require("../utils/language") as typeof import("../utils/language")
const time = sync.require("../utils/time") as typeof import("../utils/time")
const cluster = sync.require("../utils/cluster") as typeof import("../utils/cluster")

commands.assign([
	{
		name: "stats",
		description: "Show detailed statistics",
		category: "meta",
		options: [
			{
				name: "window",
				type: 3,
				description: "The type of stats to show",
				choices: [
					{
						name: "gateway",
						value: "gw"
					},
					{
						name: "music",
						value: "m"
					}
				],
				required: false
			}
		],
		async process(cmd, lang) {
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })
			const sid = cmd.guild_id ? Number((BigInt(cmd.guild_id) >> BigInt(22)) % BigInt(config.total_shards)) : 0
			const leadingIdentity = `${client.user.username}#${client.user.discriminator} <:online:606664341298872324>\n${config.cluster_id} tree, branch ${sid}`
			const leadingSpace = `${emojis.bl}\n​`

			const category = cmd.data.options.get("window")?.asString()
			if (category === "gw") {
				const before = Date.now()
				const stats = await requester.request(constants.GATEWAY_WORKER_CODES.STATS, undefined, (p) => passthrough.gateway.postMessage(p)) as { ram: { rss: number; heapTotal: number; heapUsed: number; }; latency: Array<number>; shards: Array<number>; uptime: number; }
				const ram = stats.ram.rss - (stats.ram.heapTotal - stats.ram.heapUsed)
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							color: constants.standard_embed_color,
							fields: [
								{
									name: leadingIdentity,
									value: `**${lang.GLOBAL.HEADER_HEARTBEAT}:**\n${stats.latency.map((i, index) => `${language.replace(lang.GLOBAL.SHARD_NUMBER, { "shard": stats.shards[index] })}: ${i}ms`).join("\n")}\n`
									+ `**❯ ${lang.GLOBAL.HEADER_LATENCY}:**\n${text.numberComma(Date.now() - before)}ms\n`
									+ `**❯ ${lang.GLOBAL.HEADER_UPTIME}:**\n${time.shortTime(stats.uptime, "sec")}\n`
									+ `**❯ ${lang.GLOBAL.HEADER_MEMORY}:**\n${bToMB(ram)}\n`,
									inline: true
								},
								{
									name: leadingSpace,
									value: `**❯ ${lang.GLOBAL.HEADER_SHARDS}:**\n[${stats.shards.join(", ")}]`,
									inline: true
								}
							]
						}
					]
				})
			} else if (category === "m") {
				const listeningcount = [...queues.values()].reduce((acc, cur) => acc + [...cur.listeners.values()].filter(u => !u.bot).length, 0)
				const nodes = constants.lavalinkNodes.map(n => n.id)
				let nodeStr = ""
				for (const node of nodes) {
					nodeStr += `${node}: ${[...queues.values()].filter(q => q.node === node).length}\n`
				}
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							color: constants.standard_embed_color,
							fields: [
								{
									name: leadingIdentity,
									value: `**❯ ${lang.GLOBAL.HEADER_SONGS_QUEUED}:**\n${text.numberComma(Array.from(queues.values()).reduce((acc, cur) => acc + cur.tracks.length, 0))}`,
									inline: true
								},
								{
									name: leadingSpace,
									value: `**❯ ${lang.GLOBAL.HEADER_VOICE_CONNECTIONS}:**\n${text.numberComma(client.lavalink!.players.size)}\n` +
										`**❯ ${lang.GLOBAL.HEADER_USERS_LISTENING}:**\n${text.numberComma(listeningcount)}\n` +
										`**❯ ${lang.GLOBAL.HEADER_NODE_USAGE}:**\n${nodeStr || lang.GLOBAL.NO_NODES}`,
									inline: true
								}
							]
						}
					]
				})
			} else {
				const stats = await cluster.getOwnStats()
				const gateway = await requester.request(constants.GATEWAY_WORKER_CODES.STATS, undefined, (p) => passthrough.gateway.postMessage(p)) as { ram: { rss: number; heapTotal: number; heapUsed: number; }; latency: Array<number>; shards: Array<number>; uptime: number; }
				return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
					embeds: [
						{
							color: constants.standard_embed_color,
							fields: [
								{
									name: leadingIdentity,
									value: `**${lang.GLOBAL.HEADER_HEARTBEAT}:**\n${Math.floor(gateway.latency.reduce((acc, cur) => acc + cur, 0) / gateway.latency.length)}ms avg\n`
									+ `**❯ ${lang.GLOBAL.HEADER_UPTIME}:**\n${time.shortTime(stats.uptime, "sec")}\n`
									+ `**❯ ${lang.GLOBAL.HEADER_MEMORY}:**\n${bToMB(stats.ram)}`,
									inline: true
								},
								{
									name: leadingSpace,
									value: `**${lang.GLOBAL.HEADER_USER_COUNT}:**\n${text.numberComma(stats.users)}\n`
									+ `**❯ ${lang.GLOBAL.HEADER_GUILD_COUNT}:**\n${text.numberComma(stats.guilds)}\n`
									+ `**❯ ${lang.GLOBAL.HEADER_CHANNEL_COUNT}:**\n${text.numberComma(stats.channels)}\n`
									+ `**❯ ${lang.GLOBAL.HEADER_VOICE_CONNECTIONS}:**\n${text.numberComma(stats.connections)}`,
									inline: true
								}
							]
						}
					]
				})
			}

			function bToMB(number: number) {
				return `${((number / 1024) / 1024).toFixed(2)}MB`
			}
		}
	},
	{
		name: "info",
		description: "Gets info about Amanda",
		category: "meta",
		process(cmd, lang) {
			return client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, {
				type: 4,
				data: {
					embeds: [
						{
							description: lang.GLOBAL.INFO_THANKS,
							fields: [
								{
									name: lang.GLOBAL.HEADER_CREATORS,
									value: "PapiOphidian#0110 <:bravery:479939311593324557> <:VerifiedDeveloper:699408396591300618> <:EarlySupporter:585638218255564800> <:NitroBadge:421774688507920406> <:boostlvl3:582555022508687370>"
								},
								{
									name: lang.GLOBAL.HEADER_CODE,
									value: `[node.js](https://nodejs.org/) ${process.version} + [SnowTransfer](https://www.npmjs.com/package/snowtransfer) & [CloudStorm](https://www.npmjs.com/package/cloudstorm)`
								},
								{
									name: lang.GLOBAL.HEADER_LINKS,
									value: language.replace(lang.GLOBAL.INFO_LINKS, { "website": `${config.website_protocol}://${config.website_domain}/`, "stats": constants.stats, "server": constants.server, "patreon": constants.patreon, "paypal": constants.paypal, "privacy": constants.privacy, "todo": constants.todo }) +
									`\n${constants.add}`
								}
							],
							color: constants.standard_embed_color
						}
					]
				}
			})
		}
	},
	{
		name: "git",
		description: "Gets the latest git commits to Amanda",
		category: "meta",
		async process(cmd, lang) {
			await client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 5 })
			const limit = 5
			const authorNameMap = {
				"Cadence Ember": "Cadence",
				"Papa": "PapiOphidian"
			}
			const status = await simpleGit.status()
			const log = await simpleGit.log({ "--no-decorate": null })
			const diffs = await Promise.all(Array(limit).fill(undefined).map((_, i) => simpleGit.diffSummary([log.all[i + 1].hash, log.all[i].hash])))
			const res = { branch: status.current!, latestCommitHash: log.latest!.hash.slice(0, 7), logString:
				log.all.slice(0, limit).map((line, index) => {
					const date = new Date(line.date)
					const dateString = `${date.toDateString()} @ ${date.toTimeString().split(":").slice(0, 2).join(":")}`
					const diff =
						`${diffs[index].files.length > 1 ? language.replace(lang.GLOBAL.GIT_FILES_CHANGED, { "amount": diffs[index].files.length }) : lang.GLOBAL.GIT_FILE_CHANGED}` +
						`${diffs[index].insertions > 1 ? language.replace(lang.GLOBAL.GIT_INSERTIONS, { "amount": diffs[index].insertions }) : lang.GLOBAL.GIT_INSERTION}` +
						`${diffs[index].deletions > 1 ? language.replace(lang.GLOBAL.GIT_DELETIONS, { "amount": diffs[index].deletions }) : lang.GLOBAL.GIT_DELETION }`
					return `\`» ${line.hash.slice(0, 7)}: ${dateString} — ${authorNameMap[line.author_name] || "Unknown"}\`\n` +
									`\`» ${diff}\`\n${line.message}`
				}).join("\n\n") }

			return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
				embeds: [
					{
						title: lang.GLOBAL.HEADER_GIT_INFO,
						fields: [
							{ name: lang.GLOBAL.HEADER_STATUS, value: language.replace(lang.GLOBAL.GIT_STATUS, { "branch": res.branch, "hash": res.latestCommitHash }) },
							{ name: language.replace(lang.GLOBAL.GIT_COMMITS, { "amount": limit }), value: res.logString }
						],
						color: constants.standard_embed_color
					}
				]
			})
		}
	},
	{
		name: "help",
		description: "Your average help command",
		category: "meta",
		options: [
			{
				name: "category",
				type: 3,
				description: "The category to get help with",
				choices: ["meta", ...commands.categories.keys()].map(i => ({ name: i, value: i })),
				required: false
			},
			{
				name: "command",
				type: 3,
				description: "The command to get help with",
				required: false
			}
		],
		process(cmd, lang) {
			let embed: import("discord-typings").Embed
			const category = cmd.data.options.get("category")?.asString()
			const command = cmd.data.options.get("command")?.asString()
			if (category || command) {
				if (category && category != "hidden" && commands.categories.has(category)) {
					const cat = commands.categories.get(category)! as Array<Exclude<keyof typeof lang, "GLOBAL">>
					const maxLength = cat.reduce((acc, cur) => Math.max(acc, cur.length), 0)
					embed = {
						author: { name: language.replace(lang.GLOBAL.HEADER_COMMAND_CATEGORY, { "category": category }) },
						description: cat.sort((a, b) => {
							const cmda = commands.cache.get(a)!
							const cmdb = commands.cache.get(b)!
							if (cmda.order !== undefined && cmdb.order !== undefined) { // both are numbers, sort based on that, lowest first
								return cmda.order - cmdb.order
							} else if (cmda.order !== undefined) { // a is defined, sort a first
								return -1
							} else if (cmdb.order !== undefined) { // b is defined, sort b first
								return 1
							} else { // we don't care
								return 0
							}
						}).map(c2 => {
							const cm = commands.cache.get(c2)!
							let desc = cm.description
							let name = cm.name
							if (lang[c2]) {
								name = lang[c2].name
								desc = lang[c2].description
							}
							return `\`${name}${" ​".repeat(maxLength - name.length)}\` ${desc}`
						}).join("\n"),
						color: constants.standard_embed_color
					}
					client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { embeds: [embed], flags: 1 << 6 } })
				} else if (command && commands.cache.has(command)) {
					const c = commands.cache.get(command)!
					const info = getDocs(c)
					embed = {
						author: { name: c.name },
						description: language.replace(lang.GLOBAL.HELP_COMMAND_BODY, { "description": info.description, "args": info.options?.map(o => o.name).join(", ") || lang.GLOBAL.NONE, "category": c.category }),
						footer: { text: lang.GLOBAL.FOOTER_HELP },
						color: constants.standard_embed_color
					}
					client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { embeds: [embed], flags: 1 << 6 } })
				} else {
					embed = {
						description: language.replace(lang.GLOBAL.HELP_INVALID_COMMAND, { "tag": `${cmd.author.username}#${cmd.author.discriminator}` }),
						color: 0xB60000
					}
					client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { embeds: [embed], flags: 1 << 6 } })
				}
			} else {
				embed = {
					author: { name: lang.GLOBAL.HEADER_COMMAND_CATEGORIES },
					description: `❯ ${Array.from(commands.categories.keys()).filter(c => c != "admin" && c != "hidden").join("\n❯ ")}\n\n${language.replace(lang.GLOBAL.HELP_SEE_ALL, { "prefix": "/" })}\n\n${language.replace(lang.GLOBAL.HELP_INFO, { "prefix": "/", "link": constants.invite_link_for_help })}`,
					color: constants.standard_embed_color
				}
				client.snow.interaction.createInteractionResponse(cmd.id, cmd.token, { type: 4, data: { embeds: [embed], flags: 1 << 6 } })
			}

			function getDocs(c: import("../types").UnpackArray<Parameters<typeof commands["assign"]>["0"]>) {
				let info = { name: c.name, description: c.description, options: c.options as Array<{ name: string; description: string; options?: Array<{ name: string; description: string; }> }> }
				if (lang[c.name]) info = { name: lang[c.name as Exclude<keyof typeof lang, "GLOBAL">].name, description: lang[c.name as Exclude<keyof typeof lang, "GLOBAL">].description, options: lang[c.name as "image"].options }
				return info
			}
		}
	}
])
