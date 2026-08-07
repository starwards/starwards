const DISCORD_API = 'https://discord.com/api/v10';

/** How many messages one `listen` call will catch up on. Discord's own per-request maximum. */
const MAX_CATCH_UP = 100;

export type CommsConfig = {
    webhookUrl: string;
    botToken: string;
    channelId: string;
};

type CrewMessage = {
    speaker: string;
    text: string;
};

/**
 * Reads the channel configuration from the process environment. A bot token is a secret and belongs
 * in the environment rather than in a client config file that gets committed, so there is no flag
 * form of this.
 */
export function readCommsConfig(env: Record<string, string | undefined>): CommsConfig | undefined {
    const { DISCORD_WEBHOOK_URL, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID } = env;
    if (!DISCORD_WEBHOOK_URL || !DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
        return undefined;
    }
    return { webhookUrl: DISCORD_WEBHOOK_URL, botToken: DISCORD_BOT_TOKEN, channelId: DISCORD_CHANNEL_ID };
}

/**
 * The crew channel: what a station says out loud, and what it hears the rest of the bridge say.
 *
 * This is deliberately outside the game. Nothing here is subject to range, jamming or a damaged comms
 * array — it is the room the crew is sitting in, not a system aboard the ship. It exists so that a
 * headless station can take part in the one thing the game is actually about: the seat that knows
 * something telling the seats that do not.
 *
 * One webhook serves the whole crew. Each message overrides the webhook's `username` with the name of
 * the station that sent it, so a reader sees six distinct speakers without six bot registrations.
 */
export class DiscordChannel {
    /**
     * Discord's paging cursor. It is unset until the first `listen`, which deliberately returns
     * nothing: a station joining an hour into a game should hear what happens next, not replay the
     * whole log.
     */
    private lastSeenId: string | undefined;

    constructor(private config: CommsConfig) {}

    async say(speaker: string, text: string): Promise<void> {
        const response = await fetch(this.config.webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: text, username: speaker }),
        });
        await assertOk(response, 'post to the crew channel');
    }

    /** Everything said since the last call, oldest first, excluding this station's own speech. */
    async listen(speaker: string): Promise<CrewMessage[]> {
        const query = new URLSearchParams({ limit: String(MAX_CATCH_UP) });
        if (this.lastSeenId) {
            query.set('after', this.lastSeenId);
        }
        const response = await fetch(`${DISCORD_API}/channels/${this.config.channelId}/messages?${query.toString()}`, {
            headers: { authorization: `Bot ${this.config.botToken}` },
        });
        await assertOk(response, 'read the crew channel');
        // Discord answers newest-first, which is the wrong order to read a conversation in.
        const messages = ((await response.json()) as DiscordMessage[]).reverse();
        if (!messages.length) {
            return [];
        }
        const firstListen = !this.lastSeenId;
        this.lastSeenId = messages[messages.length - 1].id;
        if (firstListen) {
            return [];
        }
        return messages
            .map((m) => ({ speaker: m.author?.username ?? 'unknown', text: m.content }))
            .filter((m) => m.speaker !== speaker && m.text.length > 0);
    }
}

type DiscordMessage = {
    id: string;
    content: string;
    author?: { username?: string };
};

async function assertOk(response: Response, what: string) {
    if (!response.ok) {
        throw new Error(`could not ${what}: Discord answered ${response.status} ${await response.text()}`);
    }
}
