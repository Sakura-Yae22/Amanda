//@ts-check

const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const rp = require("request-promise");
const events = require("events");
const lavalink = require("discord.js-lavalink")

const passthrough = require("../../passthrough")
let {client, reloader, queueStore} = passthrough

const voiceEmptyDuration = 20000;

let utils = require("../../modules/utilities.js");
reloader.useSync("./modules/utilities.js", utils);

let lang = require("../../modules/lang.js");
reloader.useSync("./modules/lang.js", lang);

let songTypes = require("./songtypes.js")
reloader.useSync("./commands/music/songtypes.js", songTypes)

let common = require("./common.js")
reloader.useSync("./commands/music/common.js", common)

class Queue {
	/**
	 * @param {queueStore} store
	 * @param {Discord.VoiceChannel} voiceChannel
	 * @param {Discord.TextChannel} textChannel
	 */
	constructor(store, voiceChannel, textChannel) {
		this.store = store
		this.guildID = voiceChannel.guild.id
		this.voiceChannel = voiceChannel
		this.textChannel = textChannel
		this.wrapper = new QueueWrapper(this)
		this.songStartTime = 0
		this.pausedAt = null
		/** @type {songTypes.Song[]} */
		this.songs = []
		this.auto = false

		this.voiceLeaveTimeout = new utils.BetterTimeout()
		.setCallback(() => {
			this.textChannel.send("Everyone left, so I have as well.");
			this._dissolve();
		})
		.setDelay(voiceEmptyDuration)

		this.voiceLeaveWarningMessagePromise = null;
		this.player = client.lavalink.join({
			guild: this.guildID,
			channel: this.voiceChannel.id,
			host: client.lavalink.nodes.first().host
		})
		this.player.on("end", event => this._onEnd(event))
		this.player.on("playerUpdate", data => {
			this.songStartTime = data.state.time - data.state.position
		})
		/** @type {Discord.Message} */
		this.np = null
		/** @type {import("../../modules/reactionmenu")} */
		this.npMenu = null
		this.npUpdater = new utils.FrequencyUpdater(() => {
			if (this.np) {
				let embed = this._buildNPEmbed()
				if (embed) this.np.edit(embed)
			}
		})
	}
	toObject() {
		return {
			guildID: this.guildID,
			voiceChannelID: this.voiceChannel.id,
			textChannelID: this.textChannel.id,
			songStartTime: this.songStartTime,
			pausedAt: this.pausedAt,
			npID: this.np ? this.np.id : null,
			songs: this.songs.map(s => s.toObject())
		}
	}
	/**
	 * Start playing the top song in the queue.
	 */
	async play() {
		let song = this.songs[0]
		await song.prepare()
		if (song.error) {
			this.textChannel.send(song.error)
			this._nextSong()
		} else {
			passthrough.periodicHistory.add("song_start")
			this.player.play(song.track).then(() => {
				this.songStartTime = Date.now()
				this._startNPUpdates()
				this.sendNewNP()
			})
		}
	}
	/**
	 * Start updating the now playing message.
	 */
	_startNPUpdates() {
		let frequency = this.songs[0].npUpdateFrequency
		let timeUntilNext5 = frequency - ((Date.now() - this.songStartTime) % frequency)
		let triggerNow = timeUntilNext5 > 1500
		//console.log(frequency, Date.now(), this.songStartTime, timeUntilNext5, triggerNow)
		this.npUpdater.start(frequency, triggerNow, timeUntilNext5)
	}
	/**
	 * Called when the player emits the "end" event.
	 * @param {LLEndEvent} event
	 */
	_onEnd(event) {
		if (event.reason == "REPLACED") return
		this._nextSong()
	}
	async _nextSong() {
		if (this.songs.length <= 1) {
			if (this.auto) {
				let lastPlayed = this.songs.shift()
				let related = await lastPlayed.getRelated()
				if (related.length) {
					this.addSong(related[0])
				} else {
					this.textChannel.send("Auto mode is on, but we ran out of related songs and had to stop playback.")
					this.auto = false
					this._dissolve()
				}
			} else {
				this._dissolve()
			}
		} else {
			this.songs.shift()
			this.play()
		}
	}
	/**
	 * Deconstruct the queue:
	 *
	 * Stop updating the now playing message.
	 * Leave the voice channel.
	 *
	 * You probably ought to make sure songs is empty and nothing is playing before calling.
	 */
	_dissolve() {
		this.npUpdater.stop(false)
		this.npMenu.destroy(true)
		client.lavalink.leave(this.guildID)
		this.store.delete(this.guildID)
	}
	/**
	 * Pause playback.
	 * @returns {String?} null on success, string reason on failure
	 */
	pause() {
		if (this.songs[0].noPauseReason) {
			return this.songs[0].noPauseReason
		} else if (this.isPaused) {
			return "Music is already paused. Use `&music resume` to resume."
		} else {
			this.pausedAt = Date.now()
			this.player.pause()
			this.npUpdater.stop(true)
			return null
		}
	}
	/**
	 * Resume playback.
	 * Returns 0 on success.
	 * Returns 1 if the queue wasn't paused.
	 * @returns {0|1}
	 */
	resume() {
		if (!this.isPaused) {
			return 1
		} else {
			let pausedTime = Date.now() - this.pausedAt
			this.songStartTime += pausedTime
			this.pausedAt = null
			this.player.resume().then(() => {
				this._startNPUpdates()
			})
			return 0
		}
	}
	/**
	 * Skip the current song by asking the player to stop.
	 */
	skip() {
		this.player.stop()
	}
	/**
	 * End playback by clearing the queue, then asking the player to stop.
	 */
	stop() {
		this.songs = []
		this.auto = false
		this.player.stop()
	}
	toggleAuto() {
		this.auto = !this.auto
	}
	/**
	 * Add a song to the end of the queue.
	 * Returns 0 on ordinary success.
	 * Returns 1 if this made the queue non-empty and started playback.
	 * @param {songTypes.Song} song
	 * @param {Number|Boolean} [insert]
	 * @returns {0|1}
	 */
	addSong(song, insert) {
		let position; // the actual position to insert into, `undefined` to push
		if (insert == undefined) { // no insert? just push
			position = -1;
		} else if (typeof(insert) == "number") { // number? insert into that point
			position = insert;
		} else if (typeof(insert) == "boolean") { // boolean?
			if (insert) position = 1; // if insert is true, insert
			else position = -1; // otherwise, push
		}
		if (position == -1) this.songs.push(song);
		else this.songs.splice(position, 0, song);
		if (this.songs.length == 1) {
			this.play()
			return 1
		} else {
			return 0
		}
	}
	removeSong(index) {
		if (index == 0) return 1
		if (!this.songs[index]) return 1
		let removed = this.songs.splice(index, 1)[0]
		if (!removed) return 2
		return 0
	}
	/**
	 * Play something from the list of related items.
	 * Returns 0 on success.
	 * Returns 1 if the index is out of range.
	 * @param {number} index Zero-based index.
	 * @param {boolean} insert
	 * @returns {Promise<0|1>}
	 */
	async playRelated(index, insert) {
		if (typeof(index) != "number" || isNaN(index) || index < 0 || Math.floor(index) != index) return 1
		let related = await this.songs[0].getRelated()
		let item = related[index]
		if (!item) return 1
		this.addSong(item, insert)
		return 0
	}
	get time() {
		if (this.isPaused) return this.pausedAt - this.songStartTime
		else return Date.now() - this.songStartTime
	}
	get timeSeconds() {
		return Math.round(this.time / 1000)
	}
	get isPaused() {
		return !!this.pausedAt
	}
	getTotalLength() {
		return this.songs.reduce((acc, cur) => (acc + cur.lengthSeconds), 0)
	}
	/**
	 * Create and return an embed containing details about the current song.
	 *	Returns null if no songs.
	 */
	_buildNPEmbed() {
		let song = this.songs[0]
		if (song) {
			return new Discord.MessageEmbed()
			.setDescription(`Now playing: **${song.title}**\n\n${song.getProgress(this.timeSeconds, this.isPaused)}`)
			.setColor(0x36393f)
		} else {
			return null
		}
	}
	/**
	 * Send a new now playing message and generate reactions on it. Destroy the previous reaction menu.
	 * This can be called internally and externally.
	 * @param {Boolean} force If false, don't create more NP messages. If true, force creation of a new one.
	 * @returns {Promise<void>}
	 */
	sendNewNP(force = false) {
		if (this.np && !force) {
			return Promise.resolve()
		} else {
			if (this.npMenu) this.npMenu.destroy(true)
			return this.textChannel.send(this._buildNPEmbed()).then(x => {
				this.np = x
				this._makeReactionMenu()
			})
		}
	}
	_makeReactionMenu() {
		this.npMenu = utils.reactionMenu(this.np, [
			{emoji: "⏯", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
				if (!this.voiceChannel.members.has(user.id)) return;
				this.wrapper.togglePlaying("reaction")
			}},
			{emoji: "⏭", remove: "user", actionType: "js", actionData: (msg, emoji, user) => {
				if (!this.voiceChannel.members.has(user.id)) return;
				this.wrapper.skip()
			}},
			{emoji: "⏹", remove: "all", ignore: "total", actionType: "js", actionData: (msg, emoji, user) => {
				if (!this.voiceChannel.members.has(user.id)) return;
				this.wrapper.stop()
			}}
		])
	}
	/**
	 * @param {Discord.VoiceState} oldState
	 * @param {Discord.VoiceState} newState
	 */
	voiceStateUpdate(oldState, newState) {
		// Update own channel
		if (newState.member.id == client.user.id && newState.channelID != oldState.channelID && newState.channel) {
			this.voiceChannel = newState.channel
		}
		// Detect number of users left in channel
		let count = this.voiceChannel.members.filter(m => !m.user.bot).size
		if (count == 0) {
			if (!this.voiceLeaveTimeout.isActive) {
				this.voiceLeaveTimeout.run()
				this.voiceLeaveWarningMessagePromise = this.textChannel.send("No users left in my voice channel. I will stop playing in "+(this.voiceLeaveTimeout.delay/1000)+" seconds if nobody rejoins.")
			}
		} else {
			this.voiceLeaveTimeout.clear()
			if (this.voiceLeaveWarningMessagePromise) {
				this.voiceLeaveWarningMessagePromise.then(msg => {
					msg.delete()
					this.voiceLeaveWarningMessagePromise = null
				})
			}
		}
	}
}

class QueueWrapper {
	/**
	 * @param {Queue} queue
	 */
	constructor(queue) {
		this.queue = queue
	}
	toggleAuto(context) {
		this.queue.toggleAuto()
		let auto = this.queue.auto
		if (context instanceof Discord.Message) {
			context.channel.send("Auto mode is now turned "+(auto ? "on" : "off"))
		}
	}
	togglePlaying(context) {
		if (this.queue.isPaused) this.resume()
		else this.pause(context)
	}
	pause(context) {
		let result = this.queue.pause()
		if (result) {
			if (context instanceof Discord.Message) {
				context.channel.send(result)
			} else if (context == "reaction") {
				this.queue.textChannel.send(result)
			}
		}
	}
	resume(context) {
		let result = this.queue.resume()
		if (result == 1) {
			if (context instanceof Discord.Message) {
				context.channel.send("Music is playing. If you want to pause, use `&music pause`.")
			}
		}
	}
	skip() {
		this.queue.skip()
	}
	stop() {
		this.queue.stop()
	}
	/**
	 * @param {Discord.TextChannel} channel
	 */
	async showRelated(channel) {
		if (!this.queue.songs[0]) return // failsafe. how did this happen? no idea. just do nothing.
		if (this.queue.songs[0].typeWhileGetRelated) channel.sendTyping()
		let content = await this.queue.songs[0].showRelated()
		channel.send(content)
	}
	/**
	 * Permitted contexts:
	 * - A message `&m rel p 1`. A reaction will be added, or an error message will be sent.
	 * @param {number} index One-based index.
	 * @param {boolean} insert
	 * @param {any} [context]
	 */
	async playRelated(index, insert, context) {
		index--
		let result = await this.queue.playRelated(index, insert)
		if (context instanceof Discord.Message) {
			if (result == 0) context.react("✅")
			else if (result == 1) context.channel.send("The number you typed isn't an item in the related list. Try `&music related`.")
		}
	}
}

module.exports.Queue = Queue
module.exports.QueueWrapper = QueueWrapper

/**
 * @typedef {Object} LLEndEvent
 * @property {String} guildId
 * @property {String} reason
 * @property {String} track
 * @property {"event"} op
 * @property {"TrackEndEvent"} type
 */
