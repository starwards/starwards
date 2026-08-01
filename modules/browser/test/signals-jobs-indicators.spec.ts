import { JobStatus } from '@starwards/core';
import { jobIndicators } from '../src/radar/signals-jobs-indicators';

function job(targetId: string, status: JobStatus, progress = 0) {
    return { targetId, status, progress };
}

describe('jobIndicators', () => {
    test('no active job — nothing shown (queued jobs without an active one are dormant)', () => {
        const jobs = [job('a', JobStatus.QUEUED), job('b', JobStatus.QUEUED)];
        expect(jobIndicators(jobs)).toEqual({ active: null, queued: [] });
    });

    test('active job yields a ring indicator with the remaining fraction', () => {
        const jobs = [job('a', JobStatus.IN_PROGRESS, 0.25)];
        expect(jobIndicators(jobs)).toEqual({ active: { targetId: 'a', remainingFraction: 0.75 }, queued: [] });
    });

    test('queued jobs after the active one get 1-based order markers, capped at 3', () => {
        const jobs = [
            job('a', JobStatus.IN_PROGRESS, 0.5),
            job('b', JobStatus.QUEUED),
            job('c', JobStatus.QUEUED),
            job('d', JobStatus.QUEUED),
            job('e', JobStatus.QUEUED),
        ];
        expect(jobIndicators(jobs).queued).toEqual([
            { targetId: 'b', order: 1 },
            { targetId: 'c', order: 2 },
            { targetId: 'd', order: 3 },
        ]);
    });

    test('queued jobs before the active one are dormant and hidden', () => {
        const jobs = [
            job('dormant', JobStatus.QUEUED),
            job('a', JobStatus.IN_PROGRESS, 0.1),
            job('b', JobStatus.QUEUED),
        ];
        expect(jobIndicators(jobs)).toEqual({
            active: { targetId: 'a', remainingFraction: 0.9 },
            queued: [{ targetId: 'b', order: 1 }],
        });
    });
});
