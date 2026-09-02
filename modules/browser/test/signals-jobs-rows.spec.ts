import { JobStatus } from '@starwards/core';
import { visibleJobRows } from '../src/widgets/signals-jobs-rows';

function job(id: string, status: JobStatus, progress = 0) {
    return { id, targetId: id, status, progress };
}

describe('visibleJobRows', () => {
    test('lists the in-progress job, then queued jobs in queue order with 1-based positions', () => {
        const jobs = [
            job('working', JobStatus.IN_PROGRESS, 0.5),
            job('a', JobStatus.QUEUED),
            job('b', JobStatus.QUEUED),
        ];
        const rows = visibleJobRows(jobs);
        expect(rows.active).toEqual({ index: 0, job: jobs[0] });
        expect(rows.queued).toEqual([
            { index: 1, job: jobs[1], position: 1 },
            { index: 2, job: jobs[2], position: 2 },
        ]);
        expect(rows.moreCount).toBe(0);
        expect(rows.dormantCount).toBe(0);
    });

    test('dormant jobs are never listed as rows, but counted', () => {
        const jobs = [
            job('working', JobStatus.IN_PROGRESS),
            job('out of sight', JobStatus.DORMANT),
            job('next', JobStatus.QUEUED),
        ];
        const rows = visibleJobRows(jobs);
        expect(rows.queued).toEqual([{ index: 2, job: jobs[2], position: 1 }]);
        expect(rows.dormantCount).toBe(1);
    });

    test('caps visible queued rows at 8 and reports the remainder', () => {
        const jobs = [
            job('working', JobStatus.IN_PROGRESS),
            ...Array.from({ length: 12 }, (_, i) => job(`q${i}`, JobStatus.QUEUED)),
        ];
        const rows = visibleJobRows(jobs);
        expect(rows.queued).toHaveLength(8);
        expect(rows.queued.map((r) => r.job.id)).toEqual(['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
        expect(rows.moreCount).toBe(4);
    });

    test('with no job being worked, active is null', () => {
        const jobs = [job('a', JobStatus.DORMANT), job('b', JobStatus.QUEUED)];
        const rows = visibleJobRows(jobs);
        expect(rows.active).toBeNull();
    });
});
