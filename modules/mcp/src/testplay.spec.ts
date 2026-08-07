import { CrewChannel, CrewMessage } from './comms/channel';
import { Driver, waitFor } from '@starwards/core/internal';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from './server';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

/**
 * The crew channel with the network taken out: the same contract `DiscordChannel` implements, so the
 * testplay exercises the real `say`/`listen` tool paths rather than a stand-in for them.
 */
class TestCrewChannel implements CrewChannel {
    private log: CrewMessage[] = [];
    private readSoFar = new Map<string, number>();

    say(speaker: string, text: string) {
        this.log.push({ speaker, text });
        return Promise.resolve();
    }

    listen(speaker: string) {
        const from = this.readSoFar.get(speaker) ?? 0;
        this.readSoFar.set(speaker, this.log.length);
        return Promise.resolve(this.log.slice(from).filter((m) => m.speaker !== speaker));
    }
}

/**
 * A whole crew, playing one ship.
 *
 * The station specs prove one seat is bounded correctly. This proves the bounding is what makes a
 * crew: three stations connect to one running game over three separate MCP sessions, and the only
 * route from what signals can read to what the pilot does about it runs through the crew channel.
 */
describe('a testplay: three stations, one ship', () => {
    const gameDriver = makeDriver();
    const channel = new TestCrewChannel();

    /** One station: its own MCP server, its own session, sharing the game and the channel. */
    class Seat {
        private client!: Client;
        private connection!: Driver;
        private server!: ReturnType<typeof buildMcpServer>;

        constructor(readonly station: string) {}

        async takeSeat(baseUrl: URL) {
            this.connection = new Driver(baseUrl).connect();
            this.server = buildMcpServer(this.connection, baseUrl, { comms: channel });
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            this.client = new Client({ name: this.station, version: '0' });
            await Promise.all([this.server.connect(serverTransport), this.client.connect(clientTransport)]);
            this.payload(await this.call('login', { shipId: test_map_1.testShipId, station: this.station }));
        }

        async leave() {
            await this.client.close();
            await this.server.close();
            this.connection.destroy();
        }

        async call(name: string, args: Record<string, unknown> = {}) {
            return (await this.client.callTool({ name, arguments: args })) as ToolResult;
        }

        payload(result: ToolResult): unknown {
            expect(result.isError).toBeFalsy();
            return JSON.parse(result.content[0].text);
        }

        refusal(result: ToolResult): string {
            expect(result.isError).toBe(true);
            return result.content[0].text;
        }
    }

    const signals = new Seat('signals');
    const pilot = new Seat('pilot');
    const weapons = new Seat('weapons');

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(test_map_1);
        const baseUrl = new URL(gameDriver.url());
        for (const seat of [signals, pilot, weapons]) {
            await seat.takeSeat(baseUrl);
        }
    });

    afterEach(async () => {
        for (const seat of [weapons, pilot, signals]) {
            await seat.leave();
        }
    });

    it('runs a contact from the seat that can read it to the seat that acts on it', async () => {
        // 1. Signals works its radar and finds something.
        const scope = signals.payload(await signals.call('get_radar_contacts')) as {
            contacts: { id: string; bearing: number; distance: number }[];
        };
        const contact = scope.contacts[0];
        expect(contact).toBeDefined();

        // 2. The pilot cannot reach the panel that would tell it what signals is looking at. This is
        //    the whole reason the next step has to happen out loud.
        expect(pilot.refusal(await pilot.call('get_ship_status', { widget: 'target-info' }))).toContain('target-info');

        // 3. Signals says it.
        signals.payload(
            await signals.call('say', { text: `contact ${contact.id} bearing ${Math.round(contact.bearing)}` }),
        );

        // 4. The pilot hears it — attributed, so it knows who to believe.
        const heard = pilot.payload(await pilot.call('listen')) as { heard: CrewMessage[] };
        expect(heard.heard).toEqual([
            { speaker: 'signals', text: `contact ${contact.id} bearing ${Math.round(contact.bearing)}` },
        ]);

        // 5. The pilot acts, and the ship in the running game turns.
        pilot.payload(await pilot.call('execute_command', { command: 'rotation', value: 0.5 }));
        await waitFor(() => {
            expect(gameDriver.getShip(test_map_1.testShipId).state.smartPilot.rotation).toBeCloseTo(0.5, 1);
        }, 3_000);
    });

    it('holds each seat to its own console while all three are connected', async () => {
        expect(weapons.refusal(await weapons.call('execute_command', { command: 'rotation', value: 0.5 }))).toContain(
            'cannot rotation',
        );
        expect(pilot.refusal(await pilot.call('execute_command', { command: 'fireChainGun', value: true }))).toContain(
            'cannot fireChainGun',
        );
        // and the seat that does hold it is unaffected by the refusals around it
        pilot.payload(await pilot.call('execute_command', { command: 'rotation', value: 0.25 }));
    });

    it('carries one conversation: everyone hears everyone, nobody hears themselves', async () => {
        signals.payload(await signals.call('say', { text: 'contact bearing 040' }));
        weapons.payload(await weapons.call('say', { text: 'no firing solution' }));

        const pilotHeard = (pilot.payload(await pilot.call('listen')) as { heard: CrewMessage[] }).heard;
        expect(pilotHeard.map((m) => m.speaker)).toEqual(['signals', 'weapons']);

        const signalsHeard = (signals.payload(await signals.call('listen')) as { heard: CrewMessage[] }).heard;
        expect(signalsHeard).toEqual([{ speaker: 'weapons', text: 'no firing solution' }]);
    });
});
