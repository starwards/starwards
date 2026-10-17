import { BridgeSeat, Driver, GameStatus, sleep } from '@starwards/core/internal';

import { BotSeats } from './game-manager';
import { makeDriver } from '../test/driver';
import { two_vs_one } from '../maps';

type Call = ['start', string, BridgeSeat, string, string] | ['stop', string, BridgeSeat] | ['stopAll'];

function fakeBotSeats() {
    const calls: Call[] = [];
    const seats: BotSeats = {
        start: (shipId, seat, botId, brain) => void calls.push(['start', shipId, seat, botId, brain]),
        stop: (shipId, seat) => void calls.push(['stop', shipId, seat]),
        stopAll: () => (calls.push(['stopAll']), Promise.resolve()),
    };
    return { calls, seats };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) throw new Error(`condition not met within ${timeoutMs}ms`);
        await sleep(20);
    }
}

describe('GM bot seats', () => {
    jest.setTimeout(30_000);
    const gameDriver = makeDriver();

    describe('admin room', () => {
        it('assignBot arrives and seats the bot', async () => {
            const manager = gameDriver.gameManager;
            await manager.startGame(two_vs_one);
            const driver = new Driver(new URL(gameDriver.url())).connect();
            try {
                const admin = await driver.getAdminDriver();
                admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' });
                await waitUntil(() => manager.state.bots.get('GVTS')?.seats.get('pilot')?.brain === 'reference');
                expect(manager.state.assignBotCommands).toEqual([]);
            } finally {
                driver.destroy();
            }
        });
    });

    describe('GameManager', () => {
        let fake: ReturnType<typeof fakeBotSeats>;
        const assign = (shipId: string, seat: string, brain: string) => {
            gameDriver.gameManager.state.assignBotCommands.push({ shipId, seat, brain });
            gameDriver.gameManager.update(0);
        };
        const bots = () => gameDriver.gameManager.state.bots;
        const entry = (shipId: string, seat: string) => bots().get(shipId)?.seats.get(seat);

        beforeEach(async () => {
            fake = fakeBotSeats();
            gameDriver.gameManager.botSeats = fake.seats;
            await gameDriver.gameManager.startGame(two_vs_one);
        });

        it('seats a bot with a fresh id and starts it', () => {
            assign('GVTS', 'pilot', 'reference');
            const e = entry('GVTS', 'pilot');
            expect(e?.toJSON()).toEqual({ id: 'bot-pilot-1', brain: 'reference', status: 'starting', message: '' });
            expect(fake.calls).toEqual([['start', 'GVTS', 'pilot', 'bot-pilot-1', 'reference']]);
        });

        it('counts bot ids server-wide', () => {
            assign('GVTS', 'pilot', 'reference');
            assign('GVTS2', 'weapons', 'reference');
            expect(entry('GVTS2', 'weapons')?.id).toBe('bot-weapons-2');
        });

        it('brain none removes the bot and stops it', () => {
            assign('GVTS', 'pilot', 'reference');
            assign('GVTS', 'pilot', 'none');
            expect(entry('GVTS', 'pilot')).toBeUndefined();
            expect(bots().size).toBe(0);
            expect(fake.calls[1]).toEqual(['stop', 'GVTS', 'pilot']);
        });

        it.each([
            ['an unknown ship', 'NOPE', 'pilot', 'reference'],
            ['a non-player ship', 'R2D2', 'pilot', 'reference'],
            ['a bot-only seat', 'GVTS', 'tactical', 'reference'],
            ['an unknown seat', 'GVTS', 'cook', 'reference'],
            ['an unknown brain', 'GVTS', 'pilot', 'jev'],
        ])('ignores %s', (_, shipId, seat, brain) => {
            assign(shipId, seat, brain);
            expect(bots().size).toBe(0);
            expect(fake.calls).toEqual([]);
        });

        it('ignores assignments while the game is stopped', async () => {
            await gameDriver.gameManager.stopGame();
            fake.calls.length = 0;
            assign('GVTS', 'pilot', 'reference');
            expect(bots().size).toBe(0);
            expect(fake.calls).toEqual([]);
        });

        it('keeps a running bot of the same brain', () => {
            assign('GVTS', 'pilot', 'reference');
            gameDriver.gameManager.setBotStatus('GVTS', 'pilot', 'bot-pilot-1', 'running');
            assign('GVTS', 'pilot', 'reference');
            expect(entry('GVTS', 'pilot')?.id).toBe('bot-pilot-1');
            expect(fake.calls).toHaveLength(1);
        });

        it('restarts a failed bot with a new id', () => {
            assign('GVTS', 'pilot', 'reference');
            gameDriver.gameManager.setBotStatus('GVTS', 'pilot', 'bot-pilot-1', 'failed', 'boom');
            expect(entry('GVTS', 'pilot')?.message).toBe('boom');
            assign('GVTS', 'pilot', 'reference');
            expect(entry('GVTS', 'pilot')?.toJSON()).toEqual({
                id: 'bot-pilot-2',
                brain: 'reference',
                status: 'starting',
                message: '',
            });
            expect(fake.calls.slice(1)).toEqual([
                ['stop', 'GVTS', 'pilot'],
                ['start', 'GVTS', 'pilot', 'bot-pilot-2', 'reference'],
            ]);
        });

        it('ignores status reports of a bot that was replaced', () => {
            assign('GVTS', 'pilot', 'reference');
            assign('GVTS', 'pilot', 'none');
            assign('GVTS', 'pilot', 'reference');
            gameDriver.gameManager.setBotStatus('GVTS', 'pilot', 'bot-pilot-1', 'failed', 'stale');
            expect(entry('GVTS', 'pilot')?.status).toBe('starting');
        });

        it('never puts a bot in the station registry, and leaves registered stations alone', () => {
            const state = gameDriver.gameManager.state;
            state.registerStationCommands.push({ stationId: 'HUMAN', stationType: 'helms', shipId: 'GVTS' });
            gameDriver.gameManager.update(0);
            const before = [...state.stations.values()].map((s) => s.toJSON());
            assign('GVTS', 'pilot', 'reference');
            assign('GVTS2', 'sigint', 'reference');
            expect(state.stations.size).toBe(before.length);
            expect([...state.stations.keys()].filter((id) => /^bot-/i.test(id))).toEqual([]);
            expect([...state.stations.values()].map((s) => s.toJSON())).toEqual(before);
            state.registerStationCommands.push({ stationId: 'HUMAN2', stationType: 'weapons', shipId: 'GVTS2' });
            gameDriver.gameManager.update(0);
            expect(entry('GVTS', 'pilot')?.id).toBe('bot-pilot-1');
            expect(entry('GVTS2', 'sigint')?.id).toBe('bot-sigint-2');
        });
    });

    describe('reset', () => {
        let fake: ReturnType<typeof fakeBotSeats>;
        const assign = (shipId: string, seat: string, brain: string) => {
            gameDriver.gameManager.state.assignBotCommands.push({ shipId, seat, brain });
            gameDriver.gameManager.update(0);
        };

        beforeEach(async () => {
            fake = fakeBotSeats();
            gameDriver.gameManager.botSeats = fake.seats;
            await gameDriver.gameManager.startGame(two_vs_one);
            assign('GVTS', 'pilot', 'reference');
            assign('GVTS', 'weapons', 'reference');
        });

        // the stop test swaps in its own BotSeats; makeDriver's afterEach stops the game through it
        afterEach(() => {
            gameDriver.gameManager.botSeats = fake.seats;
        });

        it('clears bots and awaits stopAll before the game reaches STOPPED', async () => {
            const manager = gameDriver.gameManager;
            let statusAtStopAll: GameStatus | null = null;
            let resolveStopAll = () => {};
            manager.botSeats = {
                ...fake.seats,
                stopAll: () => {
                    statusAtStopAll = manager.state.gameStatus;
                    return new Promise<void>((r) => (resolveStopAll = r));
                },
            };
            const stopping = manager.stopGame();
            expect(manager.state.bots.size).toBe(0);
            expect(statusAtStopAll).toBe(GameStatus.STOPPING);
            await sleep(50);
            expect(manager.state.gameStatus).toBe(GameStatus.STOPPING);
            resolveStopAll();
            await stopping;
            expect(manager.state.gameStatus).toBe(GameStatus.STOPPED);
        });

        it('has no bots after loading a game', async () => {
            const manager = gameDriver.gameManager;
            const saved = manager.saveGame()!;
            await manager.loadGame(saved, two_vs_one);
            expect(manager.state.bots.size).toBe(0);
            expect(fake.calls).toContainEqual(['stopAll']);
        });

        it('removes the bots of a ship that leaves the players', async () => {
            const manager = gameDriver.gameManager;
            await manager.convertShipType('GVTS', false);
            manager.update(0);
            expect(manager.state.bots.size).toBe(0);
            expect(fake.calls.slice(2)).toEqual(
                expect.arrayContaining([
                    ['stop', 'GVTS', 'pilot'],
                    ['stop', 'GVTS', 'weapons'],
                ]),
            );
            expect(fake.calls.filter((c) => c[0] === 'stop')).toHaveLength(2);
        });

        it('never writes bots to a save', () => {
            expect(JSON.stringify(gameDriver.gameManager.saveGame()!.toJSON())).not.toContain('"bots"');
        });
    });
});
