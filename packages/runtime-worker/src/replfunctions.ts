import path = require("path")
import fs = require("fs")

import Lang = require("@amanda/lang")

import type { APIApplicationCommandOption, LocaleString } from "discord-api-types/v10"

import passthrough = require("./passthrough")
const { client, confprovider, commands } = passthrough

type LocaledObject = { [locale in LocaleString]?: string; }
type NameAndDesc = { name: string; description: string; }

const extraContext = {
	underscoreToEndRegex: /_\w+$/,
	nameRegex: /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u,
	buildCommandLanguageObject(cmd: string) {
		const localizations = Object.entries(Lang).map(([k, l]) => ({
			lang: k.replace(extraContext.underscoreToEndRegex, sub => `-${sub.slice(1).toUpperCase()}`), cmd: l[cmd] || {}
		})) as Array<{ lang: string; cmd: NameAndDesc & { options?: Array<NameAndDesc & { options?: Array<NameAndDesc> }> } }>

		return {
			name_localizations: localizations.reduce((acc, cur) => {
				const toMatch = cur.cmd.name
				if (!toMatch) return acc
				const match = extraContext.nameRegex.exec(toMatch)
				if (!match) {
					console.log(`${toMatch} doesn't match name regex. Ignoring`)
					return acc
				}
				const final = toMatch?.toLowerCase().trim()
				if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
				acc[cur.lang] = final
				return acc
			}, {}),
			description_localizations: localizations.reduce((acc, cur) => { acc[cur.lang] = cur.cmd.description; return acc }, {})
		}
	},
	buildCommandLanguageOptions(cmd: string) {
		const command = commands.commands.get(cmd)
		if (!command?.options) return void 0
		const localizations = Object.entries(Lang).map(([k, l]) => ({ lang: k.replace(extraContext.underscoreToEndRegex, sub => `-${sub.slice(1).toUpperCase()}`), cmd: l[cmd] || {} })) as Array<{ lang: string; cmd: NameAndDesc & { options?: Record<string, NameAndDesc & { options?: Record<string, NameAndDesc> }> } }>

		return command.options.map(cur => Object.assign({
			name_localizations: localizations.reduce((acc, desc) => {
				const toMatch = desc.cmd.options?.[cur.name].name
				const match = toMatch?.match(extraContext.nameRegex)
				if (toMatch && !match) {
					console.log(`${toMatch} doesn't match name regex. Ignoring`)
					return acc
				}
				const final = toMatch?.toLowerCase().trim()
				if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
				acc[desc.lang] = final
				return acc
			}, {}) as LocaledObject,
			description_localizations: localizations.reduce((acc, desc) => { acc[desc.lang] = desc.cmd.options?.[cur.name].description; return acc }, {}) as LocaledObject,
			options: cur.type === 1 && cur.options
				? cur.options.map(cur2 => Object.assign({
					name_localizations: localizations.reduce((acc, desc) => {
						const toMatch = desc.cmd.options![cur.name].options![cur2.name].name
						const match = extraContext.nameRegex.exec(toMatch)
						if (toMatch && !match) {
							console.log(`${toMatch} doesn't match name regex. Ignoring`)
							return acc
						}
						const final = toMatch?.toLowerCase().trim()
						if (final !== toMatch) console.error(`${toMatch} !== ${final}`)
						acc[desc.lang] = final
						return acc
					}, {}) as LocaledObject,
					description_localizations: localizations.reduce((acc, desc) => { acc[desc.lang] = desc.cmd.options![cur.name].options![cur2.name].description; return acc }, {}) as LocaledObject
				}, cur2))
				: void 0
		}, cur))
	},
	async refreshcommands() {
		const payload = Array.from(commands.commands.values()).map(c => {
			const obj = extraContext.buildCommandLanguageObject(c.name)
			const options = extraContext.buildCommandLanguageOptions(c.name)
			return {
				name: c.name,
				description: c.description,
				name_localizations: Object.keys(obj.name_localizations).length ? obj.name_localizations : void 0,
				description_localizations: Object.keys(obj.description_localizations).length ? obj.description_localizations : void 0,
				options: options,
				default_member_permissions: null
			}
		})
		// Amanda is a "new" account which doesn't have a different ID from the application
		const response = await client.snow.interaction.bulkOverwriteApplicationCommands(confprovider.config.client_id, payload).catch(console.error)
		console.log(response)
	},
	generatedocs() {
		const cmds = Array.from(commands.commands.values()).map(c => {
			const value: NameAndDesc & { options?: Array<NameAndDesc>; } = {
				name: c.name,
				description: c.description
			}
			if (c.options) value.options = c.options.map(extraContext.assignOptions)
			return [c.name, value] as [string, typeof value]
		})
		const v = {} as { [name: string]: import("@amanda/shared-types").UnpackArray<typeof cmds>["1"] }
		for (const [name, value] of cmds) v[name] = value
		fs.promises.writeFile(path.join(__dirname, "../../runtime-website/webroot/commands.json"), JSON.stringify(v))
	},
	assignOptions(option: APIApplicationCommandOption): NameAndDesc & { options?: Array<NameAndDesc> } {
		const rt: ReturnType<typeof extraContext.assignOptions> = {
			name: option.name,
			description: option.description
		}
		if (option.type === 1 && option.options) rt.options = option.options.map(extraContext.assignOptions)
		return rt
	}
}

export = extraContext
