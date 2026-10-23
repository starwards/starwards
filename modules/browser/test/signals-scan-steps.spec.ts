import { JobStatus, ScanLevel } from '@starwards/core';
import { PROMOTION_WATCH_MS, PromotionWatch, jobsSignature, scanStepLabel } from '../src/widgets/signals-scan-steps';

describe('scanStepLabel', () => {
    test('an unidentified contact is being identified', () => {
        expect(scanStepLabel(ScanLevel.UFO)).toBe('→BASIC');
    });
    test('an identified or decayed contact is being deep-scanned to FULL', () => {
        expect(scanStepLabel(ScanLevel.BASIC)).toBe('→FULL');
        expect(scanStepLabel(ScanLevel.SNAPSHOT)).toBe('→FULL');
    });
});

describe('jobsSignature', () => {
    const job = { id: 'j', targetId: 't', status: JobStatus.DORMANT, prioritized: false, needsBeam: false };
    test('changes when a job starts or stops needing the beam', () => {
        const levelOf = () => ScanLevel.BASIC;
        expect(jobsSignature([{ ...job, needsBeam: true }], levelOf)).not.toBe(jobsSignature([job], levelOf));
    });
    test("changes when a job's target is promoted", () => {
        expect(jobsSignature([job], () => ScanLevel.BASIC)).not.toBe(jobsSignature([job], () => ScanLevel.UFO));
    });
    test('is stable when nothing rendered changed', () => {
        expect(jobsSignature([job], () => ScanLevel.UFO)).toBe(jobsSignature([{ ...job }], () => ScanLevel.UFO));
    });
});

describe('PromotionWatch', () => {
    test('reports a queued target promoted in place, with the level reached', () => {
        const levels: Record<string, ScanLevel> = { ship: ScanLevel.UFO, rock: ScanLevel.UFO };
        const watch = new PromotionWatch();
        expect(watch.observe(['ship', 'rock'], (id) => levels[id], 0)).toEqual([]);
        levels.ship = ScanLevel.BASIC;
        expect(watch.observe(['ship', 'rock'], (id) => levels[id], 200)).toEqual([
            { targetId: 'ship', level: ScanLevel.BASIC },
        ]);
        expect(watch.observe(['ship', 'rock'], (id) => levels[id], 400)).toEqual([]);
    });

    test('catches a completion whose level update lands after the job left the queue', () => {
        const levels: Record<string, ScanLevel> = { ship: ScanLevel.BASIC };
        const watch = new PromotionWatch();
        watch.observe(['ship'], (id) => levels[id], 0);
        // job removed first (ship room), level still stale (space room)
        expect(watch.observe([], (id) => levels[id], 200)).toEqual([]);
        levels.ship = ScanLevel.FULL;
        expect(watch.observe([], (id) => levels[id], 400)).toEqual([{ targetId: 'ship', level: ScanLevel.FULL }]);
    });

    test('stops watching a dequeued target after the watch window', () => {
        const levels: Record<string, ScanLevel> = { ship: ScanLevel.BASIC };
        const watch = new PromotionWatch();
        watch.observe(['ship'], (id) => levels[id], 0);
        watch.observe([], (id) => levels[id], PROMOTION_WATCH_MS + 1);
        levels.ship = ScanLevel.FULL;
        expect(watch.observe([], (id) => levels[id], PROMOTION_WATCH_MS + 200)).toEqual([]);
    });

    test('ignores demotions and targets gone from space', () => {
        const levels: Record<string, ScanLevel | undefined> = { decayed: ScanLevel.FULL, gone: ScanLevel.UFO };
        const watch = new PromotionWatch();
        watch.observe(['decayed', 'gone'], (id) => levels[id], 0);
        levels.decayed = ScanLevel.SNAPSHOT;
        levels.gone = undefined;
        expect(watch.observe(['decayed', 'gone'], (id) => levels[id], 200)).toEqual([]);
    });
});
