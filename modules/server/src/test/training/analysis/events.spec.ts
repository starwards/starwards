import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Store } from './store';
import { computeEvents } from './events';
import { rmDirRetrying } from './__fixtures__/rm-retry';

jest.setTimeout(30_000);

describe('computeEvents', () => {
    // One store for the whole suite (opening/closing DuckDB per test is slow, and closing does
    // not release the Windows file handle immediately -- see store.spec.ts). Tests isolate via a
    // fresh `run_id` each, since every query here is scoped by it.
    let dir: string;
    let store: Store;
    let runId: string;
    let nextRunId = 0;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-analysis-events-'));
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

    async function value(objectId: string, p: string, t: number, opts: { num?: number; bool?: boolean }) {
        await store.run(
            'INSERT INTO value VALUES (?, ?, ?, ?, ?, ?, ?)',
            runId,
            objectId,
            p,
            t,
            opts.num ?? null,
            null,
            opts.bool ?? null,
        );
    }
    async function frame(t: number) {
        await store.run('INSERT INTO frame VALUES (?, ?, ?)', runId, Math.round(t * 10), t);
    }
    async function object(objectId: string, type: string, firstT: number, lastT: number, role: string | null) {
        await store.run('INSERT INTO object VALUES (?, ?, ?, ?, ?, ?)', runId, objectId, type, firstT, lastT, role);
    }
    async function eventsOfKind(kind: string) {
        return store.all<{ t: number; object_id: string; detail_json: string }>(
            'SELECT t, object_id, detail_json FROM event WHERE run_id = ? AND kind = ? ORDER BY t',
            runId,
            kind,
        );
    }

    it('fires spawn/despawn exactly once each', async () => {
        await frame(0);
        await frame(1);
        await object('a', 'Spaceship', 0, 0, null);
        await computeEvents(store, runId);
        expect(await eventsOfKind('spawn')).toHaveLength(1);
        expect(await eventsOfKind('despawn')).toHaveLength(1);
    });

    it('fires destroyed exactly once on the false->true edge', async () => {
        await frame(0);
        await frame(1);
        await object('a', 'Spaceship', 0, 1, null);
        await value('a', '/destroyed', 0, { bool: false });
        await value('a', '/destroyed', 1, { bool: true });
        await computeEvents(store, runId);
        expect(await eventsOfKind('destroyed')).toHaveLength(1);
    });

    it('fires plate_broken per plate and armor_stripped once all plates are down', async () => {
        await frame(0);
        await frame(1);
        await frame(2);
        await object('a', 'Spaceship', 0, 2, null);
        await value('a', '/armor/armorPlates/0/layers/0/health', 0, { num: 10 });
        await value('a', '/armor/armorPlates/1/layers/0/health', 0, { num: 10 });
        await value('a', '/armor/armorPlates/0/layers/0/health', 1, { num: 0 });
        await value('a', '/armor/armorPlates/1/layers/0/health', 2, { num: 0 });
        await computeEvents(store, runId);
        expect(await eventsOfKind('plate_broken')).toHaveLength(2);
        const stripped = await eventsOfKind('armor_stripped');
        expect(stripped).toHaveLength(1);
        expect(stripped[0].t).toBe(2);
    });

    it('fires fire_start/fire_stop on isFiring edges, not on the first-frame baseline', async () => {
        await frame(0);
        await frame(1);
        await frame(2);
        await object('a', 'Spaceship', 0, 2, null);
        await value('a', '/chainGuns/0/isFiring', 0, { bool: false }); // baseline -- not an edge
        await value('a', '/chainGuns/0/isFiring', 1, { bool: true });
        await value('a', '/chainGuns/0/isFiring', 2, { bool: false });
        await computeEvents(store, runId);
        expect(await eventsOfKind('fire_start')).toHaveLength(1);
        expect(await eventsOfKind('fire_stop')).toHaveLength(1);
    });

    it('fires ammo_empty when a magazine count reaches 0', async () => {
        await frame(0);
        await frame(1);
        await object('a', 'Spaceship', 0, 1, null);
        await value('a', '/magazine/count_HiExpShell', 0, { num: 5 });
        await value('a', '/magazine/count_HiExpShell', 1, { num: 0 });
        await computeEvents(store, runId);
        expect(await eventsOfKind('ammo_empty')).toHaveLength(1);
    });

    it('fires system_broken/system_repaired on broken edges', async () => {
        await frame(0);
        await frame(1);
        await frame(2);
        await object('a', 'Spaceship', 0, 2, null);
        await value('a', '/maneuvering/broken', 0, { bool: false });
        await value('a', '/maneuvering/broken', 1, { bool: true });
        await value('a', '/maneuvering/broken', 2, { bool: false });
        await computeEvents(store, runId);
        expect(await eventsOfKind('system_broken')).toHaveLength(1);
        expect(await eventsOfKind('system_repaired')).toHaveLength(1);
    });

    it('fires health_threshold exactly once per crossed threshold, with the threshold in detail_json', async () => {
        await frame(0);
        await frame(1);
        await object('a', 'Spaceship', 0, 1, null);
        await value('a', '/healthRatio', 0, { num: 1 });
        await value('a', '/healthRatio', 1, { num: 0.6 }); // crosses 0.75 downward, not 0.5
        await computeEvents(store, runId);
        const crossed = await eventsOfKind('health_threshold');
        expect(crossed).toHaveLength(1);
        expect(JSON.parse(crossed[0].detail_json)).toEqual({ threshold: 0.75 });
    });

    it('fires velocity_spike when a delta exceeds factor * median delta, recording the threshold', async () => {
        await object('a', 'Spaceship', 0, 5, null);
        for (let t = 0; t <= 5; t++) {
            await frame(t);
            // small steady drift, then one large jump at t=3
            const vx = t === 3 ? 500 : t;
            await value('a', '/velocity/x', t, { num: vx });
            await value('a', '/velocity/y', t, { num: 0 });
        }
        await computeEvents(store, runId, { velocitySpikeFactor: 3, proximityMetres: 500, healthThresholds: [0.5] });
        const spikes = await eventsOfKind('velocity_spike');
        expect(spikes.length).toBeGreaterThan(0);
        expect(spikes.some((s) => s.t === 3)).toBe(true);
        expect(JSON.parse(spikes[0].detail_json)).toHaveProperty('threshold');
    });

    it('fires proximity when player/target distance first drops below the threshold', async () => {
        await frame(0);
        await frame(1);
        await frame(2);
        await object('p', 'Spaceship', 0, 2, 'player');
        await object('t', 'Spaceship', 0, 2, 'target');
        await value('p', '/position/x', 0, { num: 0 });
        await value('p', '/position/y', 0, { num: 0 });
        await value('t', '/position/x', 0, { num: 1000 });
        await value('t', '/position/y', 0, { num: 0 });
        await value('t', '/position/x', 1, { num: 100 }); // now within the 500 m threshold
        await computeEvents(store, runId, { velocitySpikeFactor: 3, proximityMetres: 500, healthThresholds: [0.5] });
        const proximity = await eventsOfKind('proximity');
        expect(proximity).toHaveLength(1);
        expect(proximity[0].t).toBe(1);
    });
});
