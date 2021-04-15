import { Client, Presence } from "discord-rpc";
import { clientID, logger } from "../config";

import Song from "@classes/song.class";

let rpcClient: discordClient;

class discordClient {
	clientId: string;
	private client: Client;
	private ready: boolean = false;
	actualPresence!: Presence;

	constructor(clientID: string) {
		rpcClient = this;
		this.clientId = clientID;
		this.client = new Client({
			transport: "ipc"
		});

		this.client.on("ready", () => {
			this.ready = true;
			this.setActivity();
		});

		this.client
			.login({ clientId: this.clientId })
			.catch(err => console.error(err));
	}

	setActivity(data?: Presence) {
		data = data ? data : this.actualPresence;
		if (!this.ready) return;

		this.client.setActivity(data).catch(() => this.client.destroy());
	}

	clearActivity() {
		if (!this.ready) return;

		this.client.clearActivity().catch(() => this.client.destroy());
	}

	destroyClient() {
		if (!this.ready) return;

		this.client.destroy();
	}
}

export const setActivity = (data: Song) => {
	const presenceData: presenceStructure = {
		largeImageKey: "logo",
		largeImageText: "Tidal"
	};

	if (!data?.startTime) return clearActivity();

	if (!data.duration) presenceData.startTimestamp = data.startTime;
	else
		presenceData.endTimestamp =
			data.startTime + data.duration + data.pausedTime;

	presenceData.state = data.title;
	presenceData.details = data.artist;
	presenceData.smallImageKey = data.paused ? "pause" : "play";
	presenceData.smallImageText = data.paused ? "Paused" : "Playing";

	if (data.quality === "HI_RES") {
		presenceData.largeImageText = "Tidal (MQA)";
		presenceData.largeImageKey = "logo_mqa";
	}

	if (data.paused && presenceData.endTimestamp)
		delete presenceData.endTimestamp;

	if (data.duration && presenceData.startTimestamp)
		delete presenceData.startTimestamp;

	logger.extend("discordManager").extend("setActivity")(
		`Setting activity with ${data.artist} - ${data.title}. Duration (in seconds): ${data.duration}`
	);

	if (!rpcClient) {
		rpcClient = new discordClient(clientID);
		rpcClient.actualPresence = presenceData;
	} else rpcClient.setActivity(presenceData);
};

const clearActivity = () => {
	if (!rpcClient) return;
	rpcClient.clearActivity();
};

export const destroyClient = () => {
	if (!rpcClient) return;
	rpcClient.destroyClient();
};
