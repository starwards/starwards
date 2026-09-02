import { JobStatus, SignalsJob } from '@starwards/core';

/** How many queued-job rows the Signals pane shows before collapsing the rest into a "+K more" row. */
const MAX_QUEUED_ROWS = 8;

export type JobView = Pick<SignalsJob, 'id' | 'targetId' | 'status' | 'progress'>;

/**
 * What the Signals job-queue pane should render: the job being worked (if any), the queued jobs
 * in queue order capped at `MAX_QUEUED_ROWS` with their 1-based position, how many queued jobs
 * were cut off, and how many jobs are dormant. A dormant job is one the station will skip, so it
 * is never listed as a row — only counted, so the operator isn't misled about what is next.
 */
export function visibleJobRows(source: Iterable<JobView>) {
    const jobs = [...source];
    const activeIndex = jobs.findIndex((job) => job.status === JobStatus.IN_PROGRESS);
    const active = activeIndex < 0 ? null : { index: activeIndex, job: jobs[activeIndex] };
    const queuedAll = jobs.map((job, index) => ({ job, index })).filter(({ job }) => job.status === JobStatus.QUEUED);
    const queued = queuedAll.slice(0, MAX_QUEUED_ROWS).map(({ job, index }, i) => ({ job, index, position: i + 1 }));
    const moreCount = Math.max(0, queuedAll.length - MAX_QUEUED_ROWS);
    const dormantCount = jobs.filter((job) => job.status === JobStatus.DORMANT).length;
    return { active, queued, moreCount, dormantCount };
}
