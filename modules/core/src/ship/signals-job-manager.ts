import { IterationData, Updateable } from '../updateable';
import { JobStatus, SignalsJob } from './signals-job';

import { ArraySchema } from '@colyseus/schema';
import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';
import { makeId } from '../id';

function findLastIndex<T>(items: ArraySchema<T>, predicate: (item: T) => boolean): number | null {
    for (let i = items.length - 1; i >= 0; i--) {
        if (predicate(items[i])) {
            return i;
        }
    }
    return null;
}

export class SignalsJobManager implements Updateable {
    constructor(
        private state: ShipState,
        private spaceManager: SpaceManager,
    ) {}

    update({ deltaSeconds }: IterationData): void {
        this.processCancelJobCommand();
        this.processPrioritizeJobCommand();
        this.updateScanJobs();
        this.trimExcessJobs();
        const activeJob = this.updateActiveJob();
        if (activeJob && !this.state.signals.jobsPaused) {
            this.processJobQueue(activeJob, deltaSeconds);
        }
    }

    private pushJob(targetId: string): SignalsJob {
        const job = new SignalsJob();
        job.id = makeId();
        job.targetId = targetId;
        job.duration = this.state.signals.design.scanBaseDuration;

        this.state.signals.jobs.push(job);
        return job;
    }

    private processPrioritizeJobCommand(): void {
        const jobId = this.state.signals.prioritizeJobId;
        if (!jobId) {
            return;
        }
        this.state.signals.prioritizeJobId = '';

        const index = this.findJobIndex(jobId);
        if (index < 0) {
            return;
        }
        const job = this.state.signals.jobs[index];
        job.prioritized = true;
        if (index > 0) {
            this.state.signals.jobs.splice(index, 1);
            this.state.signals.jobs.unshift(job);
        }
    }

    private processCancelJobCommand(): void {
        const cancelId = this.state.signals.cancelJobId;
        if (!cancelId) {
            return;
        }
        this.state.signals.cancelJobId = '';

        const index = this.findJobIndex(cancelId);
        if (index >= 0) {
            this.state.signals.jobs.splice(index, 1);
        }
    }

    /**
     * When the queue shrinks (system damage), evict from the back: queued unprioritized jobs
     * first, then queued prioritized ones, and the active job only as a last resort.
     */
    private trimExcessJobs(): void {
        const jobs = this.state.signals.jobs;
        while (jobs.length > this.state.signals.currentMaxJobs) {
            const evictIndex =
                findLastIndex(jobs, (job) => !job.prioritized && job.status === JobStatus.QUEUED) ??
                findLastIndex(jobs, (job) => job.status === JobStatus.QUEUED) ??
                jobs.length - 1;
            jobs.splice(evictIndex, 1);
        }
    }

    /**
     * A job is workable when the station can make progress on it right now: the target is in the
     * ship's field of view and still has something left to reveal. A prioritized job that is not
     * workable lies dormant in place instead of being pruned.
     */
    private isJobWorkable(job: SignalsJob): boolean {
        if (!this.spaceManager.isVisible(this.state.id, job.targetId)) {
            return false;
        }
        return this.spaceManager.getScanLevel(job.targetId, this.state.faction) < ScanLevel.FULL;
    }

    /**
     * The station always works the first workable job in the queue. A job that loses the working
     * slot (displaced by a prioritized job, or its target slipping out of sight) loses all
     * progress — progress only survives while a job stays active.
     */
    private updateActiveJob(): SignalsJob | undefined {
        const jobs = this.state.signals.jobs;
        const next = jobs.find((job) => this.isJobWorkable(job));
        for (const job of jobs) {
            if (job !== next && job.status === JobStatus.IN_PROGRESS) {
                job.status = JobStatus.QUEUED;
                job.progress = 0;
            }
        }
        if (next && next.status !== JobStatus.IN_PROGRESS) {
            next.status = JobStatus.IN_PROGRESS;
        }
        return next;
    }

    private processJobQueue(activeJob: SignalsJob, deltaSeconds: number): void {
        const effectiveness = this.getSignalsEffectiveness();
        if (effectiveness <= 0) {
            return;
        }

        const effectiveDuration = activeJob.duration / effectiveness;
        const progressIncrement = deltaSeconds / effectiveDuration;
        activeJob.progress = Math.min(1, activeJob.progress + progressIncrement);

        if (activeJob.progress >= 1) {
            this.completeJob(activeJob);
        }
    }

    private completeJob(job: SignalsJob): void {
        // scans are passive and deterministic: sustaining line of sight for the job's duration
        // promotes the target one tier
        this.applyScanPromotion(job.targetId);
        this.removeJob(job.id);
        this.updateActiveJob();
    }

    private applyScanPromotion(targetId: string): void {
        const level = this.spaceManager.getScanLevel(targetId, this.state.faction);
        if (level < ScanLevel.FULL) {
            const next = level === ScanLevel.UFO ? ScanLevel.BASIC : ScanLevel.FULL;
            this.spaceManager.setScanLevel(targetId, this.state.faction, next);
        }
    }

    /**
     * Scan jobs are auto-managed: every space object in this ship's field of view whose faction
     * scan level is below FULL gets a scan job appended to the end of the queue. A job whose
     * target left the field of view (or reached FULL) is dropped — unless it was prioritized, in
     * which case it lies dormant in place so the queue order of prioritized jobs survives sight
     * loss. Players prioritize by moving jobs to the top of the queue; a cancelled job re-enters
     * at the end of the queue while its target stays visible.
     */
    private updateScanJobs(): void {
        const jobs = this.state.signals.jobs;
        for (let i = jobs.length - 1; i >= 0; i--) {
            const job = jobs[i];
            if (!job.prioritized && !this.isJobWorkable(job)) {
                jobs.splice(i, 1);
            }
        }
        for (const target of this.spaceManager.state) {
            if (jobs.length >= this.state.signals.currentMaxJobs) {
                break;
            }
            if (target.id === this.state.id || target.destroyed) {
                continue;
            }
            if (this.spaceManager.getScanLevel(target.id, this.state.faction) >= ScanLevel.FULL) {
                continue;
            }
            if (jobs.some((job) => job.targetId === target.id)) {
                continue;
            }
            if (!this.spaceManager.isVisible(this.state.id, target.id)) {
                continue;
            }
            this.pushJob(target.id);
        }
    }

    private getSignalsEffectiveness(): number {
        return this.state.signals.effectiveness * this.state.signals.jobSpeedFactor;
    }

    private findJobIndex(jobId: string): number {
        return this.state.signals.jobs.findIndex((job) => job.id === jobId);
    }

    private removeJob(jobId: string): void {
        const index = this.findJobIndex(jobId);
        if (index >= 0) {
            this.state.signals.jobs.splice(index, 1);
        }
    }
}
