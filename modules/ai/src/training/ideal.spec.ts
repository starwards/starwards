import { Ideal, idealScript, pickStationAttacker } from './ideal';
import { TRAINING_PLAYER_ID, createTrainingT1Map } from '@starwards/server/src/scenarios/training';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { ammoTelemetry } from './ammo-telemetry';
import { magazineStocks } from '@starwards/core/internal';

function setUp(ideals: Ideal[]) {
    const game = HeadlessGame.start(createTrainingT1Map({ distance: 4000, bearing: 0 }), 1, { crewedPlayer: true });
    const manager = game.shipManagers.get(TRAINING_PLAYER_ID)!;
    const magazine = manager.state.magazine;
    const script = idealScript(ideals) ?? (() => undefined);
    script(game);
    const counts = () => magazineStocks.map((s) => magazine.getCount(s));
    /** Many magazine hits, as the damage manager rolls them. */
    const hits = () => {
        const damage = (manager as unknown as { damageManager: Record<string, (m: unknown, id: string) => void> })
            .damageManager;
        for (let i = 0; i < 40; i++) damage.damageMagazine(magazine, `test-${i}`);
    };
    return { game, magazine, script, counts, hits };
}

describe('ammo idealizations', () => {
    test('stock: the magazine never runs dry, but hits still shrink it', () => {
        const { game, magazine, script, hits } = setUp(['stock']);
        hits();
        magazine.setCount('HiExpShell', 0);
        script(game);
        expect(magazine.capacity).toBeLessThan(1);
        expect(magazine.getCount('HiExpShell')).toBe(magazine.getMax('HiExpShell'));
    });

    test('cap: hits never shrink the magazine, but rounds spent and lost stay gone', () => {
        const { game, magazine, script, counts, hits } = setUp(['cap']);
        const before = counts();
        hits();
        magazine.setCount('ArmPenShell', 0);
        script(game);
        expect(magazine.capacity).toBe(1);
        expect(magazine.getCount('ArmPenShell')).toBe(0);
        expect(counts().some((c, i) => c < before[i] && magazineStocks[i] !== 'ArmPenShell')).toBe(true);
    });

    test('nohit: magazine hits do nothing at all', () => {
        const { magazine, counts, hits } = setUp(['nohit']);
        const before = counts();
        hits();
        expect(magazine.capacity).toBe(1);
        expect(counts()).toEqual(before);
    });

    test('eff: the GVTS starts with half again as many rounds of each type', () => {
        const stock = setUp([]).counts();
        const { game, counts, script } = setUp(['eff']);
        script(game);
        expect(counts()).toEqual(stock.map((c) => Math.round(c * 1.5)));
    });
});

test('frag: only Frag shells, never running dry', () => {
    const { game, magazine, script } = setUp(['frag']);
    magazine.setCount('FragShell', 0);
    script(game);
    expect(magazine.getCount('HiExpShell')).toBe(0);
    expect(magazine.getCount('ArmPenShell')).toBe(0);
    expect(magazine.getCount('FragShell')).toBe(magazine.getMax('FragShell'));
});

describe('ammo telemetry', () => {
    test('counts rounds drawn from the magazine, not rounds lost to hits, and when a type ran dry', () => {
        const { game, magazine, hits } = setUp([]);
        const telemetry = ammoTelemetry();
        telemetry.tick(game);
        const start = magazine.getCount('FragShell');
        for (let i = 0; i < 3; i++) magazine.setCount('FragShell', magazine.getCount('FragShell') - 1);
        hits();
        magazine.setCount('HiExpShell', 0);
        const report = telemetry.report(game);
        expect(report.firedTotal.FragShell).toBe(3);
        expect(report.emptyAt.HiExpShell).toBe(game.seconds);
        expect(report.emptyAt.FragShell).toBeUndefined();
        expect(start).toBeGreaterThan(3);
    });

    test('shells: shells refill, missiles do not', () => {
        const { game, magazine, script } = setUp(['shells']);
        magazine.setCount('HiExpShell', 0);
        const missiles = magazine.getCount('HiExpMissile');
        magazine.setCount('HiExpMissile', Math.max(0, missiles - 1));
        script(game);
        expect(magazine.getCount('HiExpShell')).toBe(magazine.getMax('HiExpShell'));
        expect(magazine.getCount('HiExpMissile')).toBe(Math.max(0, missiles - 1));
    });

    test('missiles: missiles refill, shells do not', () => {
        const { game, magazine, script } = setUp(['missiles']);
        magazine.setCount('HiExpShell', 0);
        magazine.setCount('HiExpMissile', 0);
        script(game);
        expect(magazine.getCount('HiExpShell')).toBe(0);
        expect(magazine.getCount('HiExpMissile')).toBe(magazine.getMax('HiExpMissile'));
    });

    test('duty: shells are emptied in the pause half of every 20 s, refilled in the fire half', () => {
        const { game, magazine, script } = setUp(['ammo', 'duty']);
        script(game);
        expect(magazine.getCount('HiExpShell')).toBe(magazine.getMax('HiExpShell'));
        while (game.seconds < 11) game.tick(0.5);
        script(game);
        expect(magazine.getCount('HiExpShell')).toBe(0);
        while (game.seconds < 21) game.tick(0.5);
        script(game);
        expect(magazine.getCount('HiExpShell')).toBe(magazine.getMax('HiExpShell'));
    });
});

describe('oracle tests (missile tactics 23h)', () => {
    test('he900: +8 HE missiles once at 900 s, past the magazine maximum', () => {
        const { game, magazine, script } = setUp(['he900']);
        magazine.setCount('HiExpMissile', magazine.getMax('HiExpMissile'));
        const before = magazine.getCount('HiExpMissile');
        script(game);
        expect(magazine.getCount('HiExpMissile')).toBe(before);
        (game as unknown as { totalSeconds: number }).totalSeconds = 900;
        script(game);
        expect(magazine.getCount('HiExpMissile')).toBe(before + 8);
        script(game);
        expect(magazine.getCount('HiExpMissile')).toBe(before + 8);
    });

    test('pickStationAttacker: the latest live attacker of the most damaged station', () => {
        const damage = new Map([
            ['s1', 10],
            ['s2', 50],
        ]);
        const attackers = new Map([
            ['s1', ['a']],
            ['s2', ['b', 'c']],
        ]);
        expect(pickStationAttacker(damage, attackers, () => true)).toBe('c');
        expect(pickStationAttacker(damage, attackers, (id) => id !== 'c')).toBe('b');
        expect(pickStationAttacker(damage, attackers, (id) => id === 'a')).toBe('a');
        expect(pickStationAttacker(damage, attackers, () => false)).toBeNull();
    });
});
