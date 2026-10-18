import { BotSupervisor } from './supervisor';
import { GameStatus } from '@starwards/core/internal';
import { makeDriver } from '../test/driver';
import { training_t0 } from '../maps';

const SHIP = 'GVTS';

const until = async (cond: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (!cond()) {
        if (Date.now() > end) throw new Error(`condition not met within ${ms}ms`);
        await new Promise((r) => setTimeout(r, 10));
    }
};

jest.setTimeout(60_000);

describe('a bot leaving lets go of its held buttons', () => {
    const gameDriver = makeDriver();
    const manager = () => gameDriver.gameManager;
    const firing = () => gameDriver.getShip(SHIP).state.chainGuns.some((g) => g.isFiring);
    const seatWeaponsMidBurst = async () => {
        manager().state.assignBotCommands.push({ shipId: SHIP, seat: 'pilot', brain: 'reference' });
        manager().state.assignBotCommands.push({ shipId: SHIP, seat: 'weapons', brain: 'reference' });
        await until(firing, 40_000);
    };

    beforeEach(async () => {
        await manager().startGame(training_t0);
    });

    it('removing the last bot mid-burst leaves the ship not firing', async () => {
        await seatWeaponsMidBurst();
        manager().state.assignBotCommands.push({ shipId: SHIP, seat: 'pilot', brain: 'none' });
        manager().state.assignBotCommands.push({ shipId: SHIP, seat: 'weapons', brain: 'none' });
        await until(() => (manager().botSeats as BotSupervisor).workerCount === 0, 5_000);
        await until(() => !firing(), 2_000);
        await new Promise((r) => setTimeout(r, 500));
        expect(firing()).toBe(false);
    });

    it('stopping a paused game with a bot mid-hold ends well within the stop grace', async () => {
        await seatWeaponsMidBurst();
        manager().state.speed = 0;
        const started = Date.now();
        await manager().stopGame();
        expect(Date.now() - started).toBeLessThan(2_000);
        expect(manager().state.gameStatus).toBe(GameStatus.STOPPED);
    });
});
