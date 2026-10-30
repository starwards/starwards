import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { plateIntelHeard, shellsFiredByAmmo } from './metrics';
import { Store } from './store';
import { rmDirRetrying } from './__fixtures__/rm-retry';

jest.setTimeout(30_000);

describe('ammo and plate_intel metrics', () => {
    let dir: string;
    let store: Store;
    const runId = 'run-0';

    async function event(t: number, kind: string, objectId: string, detail: unknown) {
        await store.run(
            'INSERT INTO event VALUES (?, ?, ?, ?, ?, ?)',
            runId,
            t,
            kind,
            objectId,
            'recorded',
            JSON.stringify(detail),
        );
    }
    const shot = (t: number, id: string, shipId: string, ammo: string) => event(t, 'shot', id, { shipId, ammo });
    const callout = (t: number, kind: string, id: string, delivered: boolean, station = 'signals') =>
        event(t, 'callout', 'gvts', { station, callout: kind, delivered, values: { id } });

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-analysis-metrics-'));
        store = Store.open(path.join(dir, 'test.duckdb'));
        await store.createSchema();
        await shot(1, 'p1', 'gvts', 'ArmPenShell');
        await shot(2, 'p2', 'gvts', 'ArmPenShell');
        await shot(3, 'p3', 'gvts', 'HiExpShell');
        await shot(4, 'p4', 'enemy', 'HiExpShell');
        await callout(1, 'plate_intel', 'target', true);
        await callout(2, 'plate_intel', 'target', false);
        await callout(3, 'plate_intel', 'other', true);
        await callout(4, 'hull_status', 'target', true);
        await callout(5, 'plate_intel', 'target', true, 'engineer');
        await callout(6, 'plate_intel', 'target', true);
    });

    afterAll(async () => {
        await store.close();
        await rmDirRetrying(dir);
    });

    it('splits the player ship shells by ammo type', async () => {
        expect(await shellsFiredByAmmo(store, runId, 'gvts')).toEqual({ ap: 2, he: 1 });
    });

    it('counts delivered Signals plate_intel calls about the target', async () => {
        expect(await plateIntelHeard(store, runId, 'target')).toBe(2);
    });
});
