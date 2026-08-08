import { CommsConfig, DiscordChannel, readCommsConfig } from './discord';

describe('discord crew channel', () => {
    const config: CommsConfig = {
        webhookUrl: 'https://discord.test/webhooks/1/abc',
        botToken: 'token',
        channelId: '42',
    };

    let fetchMock: jest.Mock;
    const realFetch = global.fetch;

    /** Discord answers newest-first, so the fixtures are written in the order the API returns them. */
    function messages(...items: { id: string; author: string; content: string }[]) {
        return {
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve(items.map((m) => ({ id: m.id, content: m.content, author: { username: m.author } }))),
        };
    }

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock;
    });

    afterEach(() => {
        global.fetch = realFetch;
    });

    describe('configuration', () => {
        it('is absent unless all three variables are set', () => {
            expect(readCommsConfig({})).toBeUndefined();
            expect(readCommsConfig({ DISCORD_WEBHOOK_URL: 'u', DISCORD_BOT_TOKEN: 't' })).toBeUndefined();
        });

        it('reads the channel from the environment', () => {
            expect(
                readCommsConfig({
                    DISCORD_WEBHOOK_URL: 'u',
                    DISCORD_BOT_TOKEN: 't',
                    DISCORD_CHANNEL_ID: 'c',
                }),
            ).toEqual({ webhookUrl: 'u', botToken: 't', channelId: 'c' });
        });
    });

    describe('say', () => {
        it('posts under the speaking station name, so the crew can tell who spoke', async () => {
            fetchMock.mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') });

            await new DiscordChannel(config).say('signals', 'contact bearing 040 is a freighter');

            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(config.webhookUrl);
            expect(JSON.parse(init.body as string)).toEqual({
                content: 'contact bearing 040 is a freighter',
                username: 'signals',
            });
        });

        it('reports what Discord said when the post fails', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 429, text: () => Promise.resolve('rate limited') });

            await expect(new DiscordChannel(config).say('pilot', 'hi')).rejects.toThrow(/429 rate limited/);
        });
    });

    describe('listen', () => {
        it('hears nothing on the first call — a station joining late does not replay the log', async () => {
            fetchMock.mockResolvedValue(messages({ id: '9', author: 'captain', content: 'old order' }));

            const channel = new DiscordChannel(config);
            expect(await channel.listen('pilot')).toEqual([]);
        });

        it('delivers what was said since the previous call, oldest first, and never twice', async () => {
            const channel = new DiscordChannel(config);
            fetchMock.mockResolvedValue(messages({ id: '1', author: 'captain', content: 'stand by' }));
            await channel.listen('pilot');

            fetchMock.mockResolvedValue(
                messages(
                    { id: '3', author: 'signals', content: 'freighter' },
                    { id: '2', author: 'captain', content: 'come about' },
                ),
            );
            expect(await channel.listen('pilot')).toEqual([
                { speaker: 'captain', text: 'come about' },
                { speaker: 'signals', text: 'freighter' },
            ]);

            fetchMock.mockResolvedValue(messages());
            expect(await channel.listen('pilot')).toEqual([]);

            const calls = fetchMock.mock.calls as [string, RequestInit][];
            expect(calls[calls.length - 1][0]).toContain('after=3');
        });

        it('does not echo the listening station back to itself', async () => {
            const channel = new DiscordChannel(config);
            fetchMock.mockResolvedValue(messages({ id: '1', author: 'captain', content: 'report' }));
            await channel.listen('pilot');

            fetchMock.mockResolvedValue(
                messages(
                    { id: '3', author: 'captain', content: 'acknowledged' },
                    { id: '2', author: 'pilot', content: 'heading 090' },
                ),
            );
            expect(await channel.listen('pilot')).toEqual([{ speaker: 'captain', text: 'acknowledged' }]);
        });

        it('authenticates as the bot', async () => {
            fetchMock.mockResolvedValue(messages());
            await new DiscordChannel(config).listen('pilot');

            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('/channels/42/messages');
            expect((init.headers as Record<string, string>).authorization).toBe('Bot token');
        });
    });
});
