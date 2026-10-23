import { JobStatus, SignalsJob } from '@starwards/core';

/** How many queued-job rows the Signals pane shows before collapsing the rest into a "+K more" row. */
const MAX_QUEUED_ROWS = 8;

export type JobView = Pick<SignalsJob, 'id' | 'targetId' | 'status' | 'progress' | 'needsBeam'>;

/**
 * What the Signals job-queue pane should render: the job being worked (if any), the queued jobs
 * in queue order capped at `MAX_QUEUED_ROWS` with their 1-based position, how many queued jobs
 * were cut off, the dormant jobs waiting only on the scan beam, and how many other jobs are
 * dormant. A dormant job is one the station will skip, so it is never listed as next up; one
 * stalled by the beam is listed as NEEDS BEAM so the operator knows why it isn't advancing.
 */
/** The job (if any) currently targeting `targetId` — the same lookup the Prioritize button and
 * the keyboard bindings for prioritize/cancel use to turn a radar selection into a job. */
export function findJobForTarget(source: Iterable<JobView>, targetId: string | undefined): JobView | undefined {
    return targetId ? [...source].find((job) => job.targetId === targetId) : undefined;
}

export function visibleJobRows(source: Iterable<JobView>) {
    const jobs = [...source];
    const activeIndex = jobs.findIndex((job) => job.status === JobStatus.IN_PROGRESS);
    const active = activeIndex < 0 ? null : { index: activeIndex, job: jobs[activeIndex] };
    const queuedAll = jobs.map((job, index) => ({ job, index })).filter(({ job }) => job.status === JobStatus.QUEUED);
    const queued = queuedAll.slice(0, MAX_QUEUED_ROWS).map(({ job, index }, i) => ({ job, index, position: i + 1 }));
    const moreCount = Math.max(0, queuedAll.length - MAX_QUEUED_ROWS);
    const dormant = jobs.map((job, index) => ({ job, index })).filter(({ job }) => job.status === JobStatus.DORMANT);
    // a job stalled only by the beam is actionable (aim the beam), so it gets a row saying so
    const needsBeam = dormant.filter(({ job }) => job.needsBeam);
    const dormantCount = dormant.length - needsBeam.length;
    return { active, queued, needsBeam, moreCount, dormantCount };
}
