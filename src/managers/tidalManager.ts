import { clearActivity, setActivity } from "@managers/discordManager";

import Process from "@classes/process";
import Song from "@classes/song";
import TidalAPI from "@classes/tidalAPI";
import { store } from "@util/config";
import { trayManager } from "../";

export default class TidalManager {
	private api: TidalAPI;
	private currentSong: Song;
	private lastSongTitle: string;
	constructor() {
		this.api = new TidalAPI();
		this.currentSong = new Song();
	}

	async rpcLoop() {
		const tidalStatus = await (await this._getTidalProcess()).tidalStatus;
		switch (tidalStatus.status) {
			case "closed":
				{
					clearActivity();
					return this._clearCurrentSong();
				}
				break;
			case "opened":
				{
					//console.log("status: opened");
					if (this.currentSong.title) this.currentSong.pausedTime += 1;
					return clearActivity();
				}
				break;
			case "playing": {
				/**
				 * Window title format: "[TRACK NAME] - [ARTIST NAME]"
				 * Example: "Shake It Off - Taylor Swift" 
				 * 
				 *! This solution is imperfect. It will split within an artist or track's name
				 *! if the delimiter is present.
				 */
				let data = tidalStatus.windowTitle?.trim().split(" - ");
				if (!data)
					return console.error("Can't get current song");

				const title = data[0].trim(),
					/** Because the window title may not be split perfectly, we take
					 * the last token, as it's guaranteed to be part of the artist name. 
					*/  
					authors = data[data.length - 1].trim().split(", ");

				let songsInfo = await this.api.searchSong(
					`${title} ${authors.toString()}`
				);

				if (!songsInfo || songsInfo.length === 0) {
					/** TIDAL's api will occasionally return no results for songs with very long names.
					 * So, we truncate the title when we try again
					 */ 
					songsInfo = await this.api.searchSong(`${title.substring(0,40)} ${authors[0]}`);

					if (!songsInfo || songsInfo.length === 0)
						return console.error(`Couldn't find current song info from name ${tidalStatus.windowTitle}`)
							, clearActivity()
							, this._clearCurrentSong();
		
				}

				const foundSong = songsInfo
					.map(s => {
						if (s.title === data[0].trim() && authors.length === s.artists.length)
							return s;
					})
					.filter(s => {
						return s;
					})[0];

				if (!foundSong) return console.error(`Couldn't find an entry in TIDAL's API for ${title} by ${authors.toString()}`)

				const getAlbumInfo = await this.api.getAlbumById(foundSong.album.id),
					timeNow = ~~(new Date().getTime() / 1000);

				if (
					timeNow - this.currentSong.startTime + this.currentSong.pausedTime 
						>= this.currentSong.duration 
					|| (this.currentSong.title !== foundSong.title 
						&& this.currentSong.artist !== this._getAuthors(foundSong.artists))
				) {
					this.currentSong.startTime = timeNow;
					this.currentSong.pausedTime = 0;
				}

				this.currentSong.artist = this._getAuthors(foundSong.artists);
				this.currentSong.title = foundSong.title;
				this.currentSong.album = {
					name: getAlbumInfo.title,
					year: new Date(getAlbumInfo.releaseDate).getUTCFullYear()
				};
				this.currentSong.duration = foundSong.duration;

				this.currentSong.buttons = [];
				this.currentSong.largeImage = foundSong?.album?.cover
					? `https://resources.tidal.com/images/${foundSong.album.cover.replace(
							/-/g,
							"/"
					  )}/1280x1280.jpg`
					: "logo";

				if (foundSong.url) {
					this.currentSong.buttons?.push({
						label: "Play on Your Streaming Platform",
						url: `${foundSong.url}?u` //The '?u' allows opening the track on other platforms
					});
				}

				console.log(this.currentSong);

				trayManager.update(this.currentSong);
				if (!store.get("showPresence")) return clearActivity();
				return setActivity(this.currentSong);
			}
		}
	}

	private _clearCurrentSong() {
		this.currentSong.title = undefined;
		this.currentSong.artist = undefined;
		this.currentSong.album = undefined;
		this.currentSong.startTime = 0;
		this.currentSong.duration = 0;
		this.currentSong.pausedTime = 0;
		this.currentSong.largeImage = undefined;

		trayManager.update();
	}

	private _getAuthors(
		res: [{ id: number; name: string; type: "string"; picture: string | null }]
	) {
		let authorString;
		if (res.length > 1) {
			const authorsArray = Array.from(res);
			authorString = authorsArray
				.slice(0, authorsArray.length)
				.map(a => a.name)
				.join(", ");
		} else authorString = res[0].name;

		return authorString;
	}

	private async _getTidalProcess(): Promise<Process> {
		const proc = new Process();
		await proc.getTidalTitle();

		return proc;
	}
}
