import passthrough = require("../passthrough")
const { confprovider, commands, client } = passthrough

import type { ChatInputCommand } from "@amanda/commands"

const poweredbychewey = `Powered by ${confprovider.config.chewey_api_url}`.replace(/https?:\/\//, "")

async function sendImage(host: string, path: string, cmd: ChatInputCommand, footer: string) {
	let url = ""
	if (host == "chewey") url = `${confprovider.config.chewey_api_url}/${path}?auth=${confprovider.config.chewey_token}`
	else return Promise.reject(new Error("Host provided not supported"))
	const data = await fetch(url).then(d => d.json())
	return client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, {
		embeds: [
			{
				color: confprovider.config.standard_embed_color,
				image: {
					url: data.data
				},
				footer: {
					text: footer
				}
			}
		]
	})
}

commands.assign([
	{
		name: "image",
		description: "Send an image of something",
		category: "images",
		options: [
			{
				name: "type",
				type: 3,
				description: "The type of image",
				choices: [
					{
						name: "cat",
						value: "cat"
					},
					{
						name: "dog",
						value: "dog"
					},
					{
						name: "space",
						value: "space"
					},
					{
						name: "snake",
						value: "snake"
					},
					{
						name: "bird",
						value: "bird"
					}
				],
				required: true
			}
		],
		process(cmd, lang) {
			const type = cmd.data.options.get("type")!.asString()
			const onFail = () => client.snow.interaction.editOriginalInteractionResponse(cmd.application_id, cmd.token, { content: lang.GLOBAL.IMAGE_FETCH_FAILED })
			if (type === "cat") return sendImage("chewey", "cat", cmd, poweredbychewey).catch(onFail)
			else if (type === "dog") return sendImage("chewey", "dog", cmd, poweredbychewey).catch(onFail)
			else if (type === "space") return sendImage("chewey", "space", cmd, poweredbychewey).catch(onFail)
			else if (type === "snake") return sendImage("chewey", "snake", cmd, poweredbychewey).catch(onFail)
			else if (type === "bird") return sendImage("chewey", "birb", cmd, poweredbychewey).catch(onFail)
		}
	}
])
