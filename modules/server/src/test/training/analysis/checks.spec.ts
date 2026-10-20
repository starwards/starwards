import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CheckResult, computeChecks } from './checks';
import { Store } from './store';
import { rmDirRetrying } from './__fixtures__/rm-retry';

jest.setTimeout(30_000);

describe('computeChecks', () => {
    // One store for the whole suite -- see events.spec.ts for why. Each test gets its own
    // `run_id`, so cross-test data never overlaps.
    let dir: string;
    let store: Store;
    let runId: string;
    let nextRunId = 0;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-analysis-checks-'));
        store = Store.open(path.join(dir, 'test.duckdb'));
        await store.createSchema();
    });

    beforeEach(() => {
        runId = `run-${nextRunId++}`;
    });

    afterAll(async () => {
        await store.close();
        await rmDirRetrying(dir);
    });

    async function value(objectId: string, p: string, t: number, opts: { num?: number; str?: string; bool?: boolean }) {
        await store.run(
            'INSERT INTO value VALUES (?, ?, ?, ?, ?, ?, ?)',
            runId,
            objectId,
            p,
            t,
            opts.num ?? null,
            opts.str ?? null,
            opts.bool ?? null,
        );
    }
    async function frame(t: number) {
        await store.run('INSERT INTO frame VALUES (?, ?, ?)', runId, Math.round(t * 10), t);
    }
    async function object(objectId: string, type: string, firstT: number, lastT: number, role: string | null) {
        await store.run('INSERT INTO object VALUES (?, ?, ?, ?, ?, ?)', runId, objectId, type, firstT, lastT, role);
    }
    async function event(t: number, kind: string, objectId: string, detail: unknown = {}) {
        await store.run(
            'INSERT INTO event VALUES (?, ?, ?, ?, ?, ?)',
            runId,
            t,
            kind,
            objectId,
            'derived',
            JSON.stringify(detail),
        );
    }
    async function run(): Promise<Record<string, CheckResult>> {
        const results = await computeChecks(store, runId);
        return Object.fromEntries(results.map((r) => [r.name, r]));
    }

    describe('shells_damage_armor', () => {
        it('skips with no player/target role', async () => {
            expect((await run()).shells_damage_armor.status).toBe('skip');
        });

        it('passes when shells fired in range correlate with plate damage', async () => {
            await object('p', 'Spaceship', 0, 1, 'player');
            await object('t', 'Spaceship', 0, 1, 'target');
            await value('p', '/position/x', 0, { num: 0 });
            await value('p', '/position/y', 0, { num: 0 });
            await value('t', '/position/x', 0, { num: 100 });
            await value('t', '/position/y', 0, { num: 0 });
            await frame(0);
            await value('p', '/magazine/count_HiExpShell', 0, { num: 300 });
            await value('p', '/magazine/count_HiExpShell', 1, { num: 0 }); // 300 fired
            await value('t', '/armor/armorPlates/0/layers/0/health', 0, { num: 100 });
            await value('t', '/armor/armorPlates/0/layers/0/health', 1, { num: 50 });
            expect((await run()).shells_damage_armor.status).toBe('pass');
        });

        it('fails when many shells are fired in range but no plate health is lost', async () => {
            await object('p', 'Spaceship', 0, 1, 'player');
            await object('t', 'Spaceship', 0, 1, 'target');
            await value('p', '/position/x', 0, { num: 0 });
            await value('p', '/position/y', 0, { num: 0 });
            await value('t', '/position/x', 0, { num: 100 });
            await value('t', '/position/y', 0, { num: 0 });
            await frame(0);
            await value('p', '/magazine/count_HiExpShell', 0, { num: 300 });
            await value('p', '/magazine/count_HiExpShell', 1, { num: 0 });
            await value('t', '/armor/armorPlates/0/layers/0/health', 0, { num: 100 });
            await value('t', '/armor/armorPlates/0/layers/0/health', 1, { num: 100 });
            expect((await run()).shells_damage_armor.status).toBe('fail');
        });
    });

    describe('strip_leads_to_kill', () => {
        it('skips when armor never stripped', async () => {
            await object('t', 'Spaceship', 0, 1, 'target');
            expect((await run()).strip_leads_to_kill.status).toBe('skip');
        });

        it('passes when destroyed within stripToKillSeconds of armor_stripped', async () => {
            await object('t', 'Spaceship', 0, 10, 'target');
            await event(5, 'armor_stripped', 't');
            await event(10, 'destroyed', 't');
            expect((await run()).strip_leads_to_kill.status).toBe('pass');
        });

        it('fails when never killed after stripping', async () => {
            await object('t', 'Spaceship', 0, 100, 'target');
            await event(5, 'armor_stripped', 't');
            expect((await run()).strip_leads_to_kill.status).toBe('fail');
        });
    });

    describe('fire_within_range', () => {
        it('skips with no player/target role', async () => {
            expect((await run()).fire_within_range.status).toBe('skip');
        });

        it("passes when fire windows stay within the gun's max range", async () => {
            await object('p', 'Spaceship', 0, 2, 'player');
            await object('t', 'Spaceship', 0, 2, 'target');
            await frame(0);
            await frame(1);
            await frame(2);
            await value('p', '/chainGuns/0/design/maxShellRange', 0, { num: 1000 });
            await value('p', '/position/x', 0, { num: 0 });
            await value('p', '/position/y', 0, { num: 0 });
            await value('t', '/position/x', 0, { num: 500 });
            await value('t', '/position/y', 0, { num: 0 });
            await event(0, 'fire_start', 'p', { gun: 0 });
            await event(2, 'fire_stop', 'p', { gun: 0 });
            expect((await run()).fire_within_range.status).toBe('pass');
        });

        it("fails when a fire window's mean distance exceeds the max range", async () => {
            await object('p', 'Spaceship', 0, 2, 'player');
            await object('t', 'Spaceship', 0, 2, 'target');
            await frame(0);
            await frame(1);
            await frame(2);
            await value('p', '/chainGuns/0/design/maxShellRange', 0, { num: 1000 });
            await value('p', '/position/x', 0, { num: 0 });
            await value('p', '/position/y', 0, { num: 0 });
            await value('t', '/position/x', 0, { num: 5000 });
            await value('t', '/position/y', 0, { num: 0 });
            await event(0, 'fire_start', 'p', { gun: 0 });
            await event(2, 'fire_stop', 'p', { gun: 0 });
            expect((await run()).fire_within_range.status).toBe('fail');
        });
    });

    describe('player_stays_mobile', () => {
        it('skips with no player role', async () => {
            expect((await run()).player_stays_mobile.status).toBe('skip');
        });

        it('passes when the player still has speed at the end', async () => {
            await object('p', 'Spaceship', 0, 1, 'player');
            await frame(0);
            await frame(1);
            await value('p', '/velocity/x', 1, { num: 10 });
            expect((await run()).player_stays_mobile.status).toBe('pass');
        });

        it('fails when the player is stopped with no propulsion break', async () => {
            await object('p', 'Spaceship', 0, 1, 'player');
            await frame(0);
            await frame(1);
            await value('p', '/velocity/x', 1, { num: 0 });
            expect((await run()).player_stays_mobile.status).toBe('fail');
        });
    });

    describe('missile_beyond_own_radar', () => {
        async function launch(id: string, t: number, model: string, targetX: number, targetVx = 0) {
            await object(id, 'Projectile', t, t + 5, null);
            await value(id, '/shipId', t, { str: 'p' });
            await value(id, '/targetId', t, { str: 't' });
            await value(id, '/model', t, { str: model });
            await value('t', '/position/x', t, { num: targetX });
            await value('t', '/position/y', t, { num: 0 });
            await value('t', '/velocity/x', t, { num: targetVx });
            await value('t', '/velocity/y', t, { num: 0 });
        }
        beforeEach(async () => {
            await object('p', 'Spaceship', 0, 100, 'player');
            await object('t', 'Spaceship', 0, 100, 'target');
            await value('p', '/position/x', 0, { num: 0 });
            await value('p', '/position/y', 0, { num: 0 });
        });

        it('skips a run whose player launched no missile', async () => {
            await launch('shell0', 5, 'CannonShell', 15_000);
            expect((await run()).missile_beyond_own_radar.status).toBe('skip');
        });

        it('skips a run whose every missile left inside the tactical radar reach', async () => {
            await launch('shell0', 5, 'HiExpMissile', 8000);
            expect((await run()).missile_beyond_own_radar.status).toBe('skip');
        });

        it('passes when a missile left at a target beyond the tactical radar reach', async () => {
            await launch('shell0', 5, 'HiExpMissile', 8000);
            await launch('shell1', 20, 'HiExpMissile', 18_000);
            const check = (await run()).missile_beyond_own_radar;
            expect(check).toMatchObject({ status: 'pass', t: 20, detail: { launches: 2, beyond: 1 } });
        });

        it('skips a missile beyond the reach but outside its launch envelope: HiExp at a target opening at cruise', async () => {
            await launch('shell0', 5, 'HiExpMissile', 18_000, 600);
            const check = (await run()).missile_beyond_own_radar;
            expect(check).toMatchObject({ status: 'skip', detail: { launches: 1, beyond: 0, outsideEnvelope: 1 } });
        });
        it('passes the oncoming check on a launch beyond the reach at a target flying in at cruise', async () => {
            await launch('shell0', 5, 'HiExpMissile', 60_000, -600);
            const check = (await run()).missile_oncoming_beyond_radar;
            expect(check).toMatchObject({ status: 'pass', t: 5, detail: { launches: 1, oncoming: 1 } });
        });

        it('skips the oncoming check on a launch beyond the reach at a still target', async () => {
            await launch('shell0', 5, 'HiExpMissile', 18_000);
            expect((await run()).missile_oncoming_beyond_radar).toMatchObject({
                status: 'skip',
                detail: { oncoming: 0 },
            });
        });
    });

    describe('frames_regular', () => {
        it('passes on evenly spaced frames', async () => {
            await store.run(
                'INSERT INTO run VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                runId,
                'm',
                's',
                1,
                1,
                null,
                null,
                1,
                3,
                3,
            );
            await frame(0);
            await frame(1);
            await frame(2);
            expect((await run()).frames_regular.status).toBe('pass');
        });

        it('fails on an irregular gap', async () => {
            await store.run(
                'INSERT INTO run VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                runId,
                'm',
                's',
                1,
                1,
                null,
                null,
                1,
                3,
                5,
            );
            await frame(0);
            await frame(1);
            await frame(5);
            expect((await run()).frames_regular.status).toBe('fail');
        });
    });
});
