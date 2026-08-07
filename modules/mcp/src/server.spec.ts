import { Driver, waitFor } from '@starwards/core/internal';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from './server';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

describe('starwards mcp server', () => {
    const gameDriver = makeDriver();

    let client: Client;
    let gameConnection: Driver;
    let mcpServer: ReturnType<typeof buildMcpServer>;

    async function call(name: string, args: Record<string, unknown> = {}) {
        return (await client.callTool({ name, arguments: args })) as ToolResult;
    }

    /** Tool results carry JSON in their text content; a refusal carries prose and `isError`. */
    function payload(result: ToolResult): unknown {
        expect(result.isError).toBeFalsy();
        return JSON.parse(result.content[0].text);
    }

    function refusal(result: ToolResult): string {
        expect(result.isError).toBe(true);
        return result.content[0].text;
    }

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(test_map_1);
        const baseUrl = new URL(gameDriver.url());
        gameConnection = new Driver(baseUrl).connect();
        mcpServer = buildMcpServer(gameConnection, baseUrl);
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        client = new Client({ name: 'test', version: '0' });
        await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    });

    afterEach(async () => {
        await client.close();
        await mcpServer.close();
        gameConnection.destroy();
    });

    it('lists the ships in the running game', async () => {
        const result = payload(await call('list_ships')) as { ships: string[] };
        expect(result.ships).toContain(test_map_1.testShipId);
    });

    it('lists the stations a ship offers, with their briefings', async () => {
        const stations = payload(await call('list_stations', { shipId: test_map_1.testShipId })) as {
            station: string;
            prompt?: string;
        }[];
        const names = stations.map((s) => s.station);
        expect(names).toEqual(expect.arrayContaining(['pilot', 'weapons', 'ecr', 'signals']));
        expect(stations.find((s) => s.station === 'pilot')?.prompt).toBeTruthy();
    });

    it('does not offer the game master seat by default', async () => {
        const stations = payload(await call('list_stations', { shipId: test_map_1.testShipId })) as {
            station: string;
        }[];
        expect(stations.map((s) => s.station)).not.toContain('gm');
        expect(refusal(await call('login', { shipId: test_map_1.testShipId, station: 'gm' }))).toContain('not open');
    });

    it('refuses to work before a station is taken', async () => {
        expect(refusal(await call('get_radar_contacts'))).toContain('not logged in');
    });

    describe('logged in as pilot', () => {
        beforeEach(async () => {
            payload(await call('login', { shipId: test_map_1.testShipId, station: 'pilot' }));
        });

        it('reports the capabilities of the seat', async () => {
            const caps = payload(await call('get_capabilities')) as {
                station: string;
                commands: { command: string; range?: [number, number] }[];
            };
            expect(caps.station).toBe('pilot');
            const rotation = caps.commands.find((c) => c.command === 'rotation');
            expect(rotation?.range).toEqual([-1, 1]);
        });

        it('flies the ship', async () => {
            payload(await call('execute_command', { command: 'rotation', value: 0.5 }));
            await waitFor(() => {
                expect(gameDriver.getShip(test_map_1.testShipId).state.smartPilot.rotation).toBeCloseTo(0.5, 1);
            }, 3_000);
        });

        it('rejects a value outside the field range, naming the range', async () => {
            const message = refusal(await call('execute_command', { command: 'rotation', value: 42 }));
            expect(message).toContain('[-1, 1]');
        });

        it('refuses a command belonging to another seat, naming what it can do', async () => {
            const message = refusal(await call('execute_command', { command: 'fireChainGun', index: 0 }));
            expect(message).toContain('cannot fireChainGun');
            expect(message).toContain('rotation');
        });

        it('refuses a panel belonging to another seat', async () => {
            expect(refusal(await call('get_ship_status', { widget: 'tubes-status' }))).toContain('has no tubes-status');
        });

        it('reads its own panels', async () => {
            const stats = payload(await call('get_ship_status', { widget: 'pilot-stats' })) as { energy: number };
            expect(typeof stats.energy).toBe('number');
        });

        it('reports radar contacts relative to the own ship', async () => {
            const radar = payload(await call('get_radar_contacts')) as {
                ownShip: { id: string };
                contacts: { id: string; distance: number }[];
                total: number;
            };
            expect(radar.ownShip.id).toBe(test_map_1.testShipId);
            expect(radar.contacts.every((c) => c.id !== test_map_1.testShipId)).toBe(true);
            // nearest first
            const distances = radar.contacts.map((c) => c.distance);
            expect([...distances].sort((a, b) => a - b)).toEqual(distances);
        });

        it('never names a contact it has not scanned', async () => {
            const radar = payload(await call('get_radar_contacts')) as {
                contacts: { id: string; name: string; scanLevel: string; type?: string; faction?: number }[];
            };
            for (const contact of radar.contacts) {
                if (contact.scanLevel === 'UFO') {
                    expect(contact.type).toBeUndefined();
                    expect(contact.faction).toBeUndefined();
                    expect(contact.name).toBe(contact.id);
                }
            }
        });
    });

    describe('a station granted nothing', () => {
        it('can see nothing and do nothing', async () => {
            // the manifest is the server's, so this exercises the deny-by-default path through a real
            // seat: the bridge engineer holds two commands and no radar of its own
            payload(await call('login', { shipId: test_map_1.testShipId, station: 'bridge-engineer' }));
            expect(refusal(await call('get_radar_contacts'))).toContain('no radar');
            expect(refusal(await call('execute_command', { command: 'rotation', value: 0.5 }))).toContain(
                'cannot rotation',
            );
        });
    });
});
