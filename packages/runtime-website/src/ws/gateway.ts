import passthrough = require("../passthrough")
const { server, confprovider, gatewayWorkers, sync } = passthrough

import type { WebSocket, WebSocketBehavior } from "uWebSockets.js"

const utils: typeof import("../utils") = sync.require("../utils")

export class GatewayWorker {
	public shards: Array<number> = []

	public constructor(public ws: WebSocket<unknown>, public clusterID: string) {
		gatewayWorkers[clusterID] = this
		console.log(`${clusterID} gateway cluster identified. ${Object.keys(gatewayWorkers).length} total clusters`)
	}

	public send(data: object): void {
		this.ws.send(JSON.stringify(data))
	}

	public onClose(): void {
		delete gatewayWorkers[this.clusterID]
		console.log(`${this.clusterID} gateway cluster disconnected. ${Object.keys(gatewayWorkers).length} total clusters`)
	}
}

server.ws("/gateway", {
	upgrade(res, req, context) {
		const secWebSocketKey = req.getHeader("sec-websocket-key")
		const secWebSocketProtocol = req.getHeader("sec-websocket-protocol")
		const secWebSocketExtensions = req.getHeader("sec-websocket-extensions")

		const auth = req.getHeader("authorization")
		const clusterID = req.getHeader("x-cluster-id")
		if (auth !== confprovider.config.current_token || !clusterID) {
			res.writeStatus("401 Unauthorized")
			return void res.endWithoutBody()
		}

		res.writeStatus("101 Switching Protocols")
		res.upgrade({ worker: undefined, clusterID }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context)
	},
	open(ws) {
		const data = ws.getUserData()
		const worker = new GatewayWorker(ws, data.clusterID)
		data.worker = worker
	},
	close(ws) {
		ws.getUserData().worker.onClose()
	},
	message(ws, message, isBinary) {
		utils.onGatewayMessage(ws, message, isBinary)
	}
} as WebSocketBehavior<{ worker: GatewayWorker, clusterID: string }>)

console.log("Gateway websocket API loaded")