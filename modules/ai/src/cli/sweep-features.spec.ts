import { NO_ENEMY, features, toCsv } from './sweep-features';
import path from 'node:path';
import { readRunLog } from '../branching/run-log';

// brain requests (captain radar, helms armor, weapons ammo, engineer status) from a real W-waves seed-13 run, 0..560 s
const log = readRunLog(path.join(__dirname, '__fixtures__', 'waves-seed13.events.jsonl'));

describe('sweep features', () => {
    it('counts identified enemies and unidentified ship contacts on the captain dradis', () => {
        const f = features(log, 366);
        expect(f.enemies).toBe(1);
        expect(f.unknowns).toBe(2);
        expect(f.hasEnemy).toBe(1);
    });

    it('codes an empty dradis with a bounded sentinel and a has-enemy flag', () => {
        const f = features(log, 300);
        expect(f.enemies).toBe(0);
        expect(f.hasEnemy).toBe(0);
        expect(NO_ENEMY).toBe(20_000);
        expect(f.nearestEnemy).toBe(NO_ENEMY);
        expect(f.enemyToStation).toBe(NO_ENEMY);
        expect(f.closestThreatToStation).toBe(NO_ENEMY);
    });

    it('gives the nearest enemy distance to each station, capped', () => {
        const f = features(log, 505);
        expect(f.hasEnemy).toBe(1);
        expect(f['enemyTo:station-platform']).toBeGreaterThan(3000);
        expect(f['enemyTo:station-platform']).toBeLessThan(10_000);
        expect(f['enemyTo:station-large']).toBeLessThanOrEqual(NO_ENEMY);
        expect(f['enemyTo:station-small']).toBeLessThanOrEqual(NO_ENEMY);
    });

    it('reads armor from the helms display, wearing down over the run', () => {
        expect(features(log, 100).armor).toBe(1);
        expect(features(log, 555).armor).toBeLessThan(1);
        expect(features(log, 555).armor).toBeGreaterThanOrEqual(0);
    });

    it('drops the hull flag the game never sets', () => {
        expect(features(log, 300)).not.toHaveProperty('hullDamaged');
    });

    it('writes a CSV with one header and a line per record, filling missing columns', () => {
        const csv = toCsv([
            { a: 1, b: 'x' },
            { a: 2, c: 3 },
        ]);
        expect(csv).toBe('a,b,c\n1,x,\n2,,3\n');
    });
});
