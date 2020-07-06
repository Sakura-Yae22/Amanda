// @ts-check

const path = require("path")
const replace = require("@amanda/lang/replace")

const passthrough = require("../../passthrough")
const { reloadEvent } = passthrough

const { addTemporaryListener } = require("./eventutils")
const sql = require("./sql")

let Lang = require("@amanda/lang")

addTemporaryListener(reloadEvent, "@amanda/lang", path.basename(__filename), () => {
	Lang = require("@amanda/lang")
})

/**
 * @param {string} id
 * @param {"self"|"guild"} type
 * @returns {Promise<Lang.Lang>}
 */
async function getLang(id, type) {
	let code, row
	if (type === "self") {
		row = await sql.get("SELECT * FROM SettingsSelf WHERE keyID = ? AND setting = ?", [id, "language"])
	} else if (type === "guild") {
		row = await sql.get("SELECT * FROM SettingsGuild WHERE keyID = ? AND setting = ?", [id, "language"])
	}
	if (row) {
		code = row.value
	} else {
		code = "en-us"
	}

	const value = Lang[code.replace("-", "_")] || Lang.en_us
	return value
}

module.exports.getLang = getLang
module.exports.replace = replace
