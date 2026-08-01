import { JobStatus } from '@starwards/core';
import { jobIndicators } from '../src/radar/signals-jobs-indicators';

function job(targetId: string, status: JobStatus, progress = 0) {
    return { targetId, status, progress };
}

describe('jobIndicators', () => {
    test('a dormant job never receives an order marker', () => {
        const jobs = [
            job('working', JobStatus.IN_PROGRESS, 0.5),
            job('out of sight', JobStatus.DORMANT),
            job('next up', JobStatus.QUEUED),
        ];
        expect(jobIndicators(jobs).queued).toEqual([{ targetId: 'next up', order: 1 }]);
    });

    test('order markers count the jobs the station will actually work, in queue order', () => {
        const jobs = [
            job('working', JobStatus.IN_PROGRESS, 0.5),
            job('b', JobStatus.QUEUED),
            job('out of sight', JobStatus.DORMANT),
            job('c', JobStatus.QUEUED),
        ];
        expect(jobIndicators(jobs).queued).toEqual([
            { targetId: 'b', order: 1 },
            { targetId: 'c', order: 2 },
        ]);
    });

    test('the radar marks at most three upcoming targets', () => {
        const jobs = [
            job('working', JobStatus.IN_PROGRESS, 0.5),
            ...['b', 'c', 'd', 'e'].map((id) => job(id, JobStatus.QUEUED)),
        ];
        expect(jobIndicators(jobs).queued.map((q) => q.targetId)).toEqual(['b', 'c', 'd']);
    });

    test('with no job being worked, nothing is marked', () => {
        const jobs = [job('a', JobStatus.DORMANT), job('b', JobStatus.QUEUED)];
        expect(jobIndicators(jobs)).toEqual({ active: null, queued: [] });
    });
});
