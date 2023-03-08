import util = require("util")

import passthrough = require("../../passthrough")

export function all(string: string, prepared?: unknown | Array<unknown>, connection?: import("pg").PoolClient, attempts = 2): Promise<Array<{ [column: string]: unknown }>> {
	if (!connection) connection = passthrough.db
	let prep: Array<unknown>
	if (prepared !== undefined && typeof (prepared) != "object") prep = [prepared]
	else if (prepared !== undefined && Array.isArray(prepared)) prep = prepared

	return new Promise((resolve, reject) => {
		if (Array.isArray(prepared) && prepared.includes(undefined)) return reject(new Error(`Prepared statement includes undefined\n	Query: ${string}\n	Prepared: ${util.inspect(prepared)}`))
		const query = { text: string, values: prep }
		if (!connection) return resolve([])
		connection.query(Array.isArray(prep) ? query : query.text).then(result => {
			const rows = result.rows
			resolve(rows || [])
		}).catch(err => {
			console.error(err)
			attempts--
			console.warn(`${string}\n${String(prepared)}`)
			if (attempts) all(string, prep, connection, attempts).then(resolve).catch(reject)
			else reject(err)
		})
	})
}

export async function get(string: string, prepared?: unknown | Array<unknown>, connection?: import("pg").PoolClient) {
	const rows = await all(string, prepared, connection)
	return rows[0] || null
}

export async function hasPermission(user: import("discord-api-types/v10").APIUser, permission: "eval" | "owner") {
	const result = await get(`SELECT ${permission} FROM user_permissions WHERE user_id = $1`, user.id)
	let r: number | undefined = undefined
	if (result) r = Object.values(result)[0] as number
	return !!r
}
