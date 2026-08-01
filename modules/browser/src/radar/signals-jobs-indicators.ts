import { JobStatus, SignalsJob } from '@starwards/core';

// how many upcoming queue targets get an order marker on the radar
export const QUEUE_MARKERS_SHOWN = 3;

type JobView = Pick<SignalsJob, 'targetId' | 'status' | 'progress'>;

type ActiveIndicator = { targetId: string; remainingFraction: number };
type QueuedIndicator = { targetId: string; order: number };

/**
 * What the signals radar should mark: a progress ring on the job being worked (remaining
 * fraction of its time), and order markers on the next few targets the station will actually
 * work. A dormant job is one the station will skip, so it never gets an order marker — marking
 * it would promise a scan that is not coming.
 */
export function jobIndicators(source: Iterable<JobView>): {
    active: ActiveIndicator | null;
    queued: QueuedIndicator[];
} {
    const jobs = [...source];
    const activeIndex = jobs.findIndex((job) => job.status === JobStatus.IN_PROGRESS);
    if (activeIndex < 0) {
        return { active: null, queued: [] };
    }
    const activeJob = jobs[activeIndex];
    const queued = jobs
        .slice(activeIndex + 1)
        .filter((job) => job.status === JobStatus.QUEUED)
        .slice(0, QUEUE_MARKERS_SHOWN)
        .map((job, i) => ({ targetId: job.targetId, order: i + 1 }));
    return { active: { targetId: activeJob.targetId, remainingFraction: 1 - activeJob.progress }, queued };
}
