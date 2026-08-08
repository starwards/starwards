import { IterationData, Updateable } from '../updateable';
import { JobStatus, SignalsJob } from './signals-job';

import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';
import { Spaceship } from '../space';
import { findLastIndex } from '../utils';
import { isSensorInvisible } from '../space/explosion';
import { makeId } from '../id';

export class SignalsJobManager implements Updateable {
    constructor(
        private state: ShipState,
        private spaceManager: SpaceManager,
    ) {}

    update({ deltaSeconds }: IterationData): void {
        this.processCancelJobCommand();
        this.processPrioritizeJobCommand();
        // auto-discovery acts once per call regardless of elapsed time, so — unlike
        // processJobQueue below, which scales by deltaSeconds — it doesn't freeze on its own
        // at deltaSeconds 0 (paused) and must be gated explicitly
        if (deltaSeconds > 0) {
            this.updateScanJobs();
        }
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
     * When the queue shrinks (system damage), evict from the back: waiting unprioritized jobs
     * first, then waiting prioritized ones, and the active job only as a last resort.
     */
    private trimExcessJobs(): void {
        const jobs = this.state.signals.jobs;
        while (jobs.length > this.state.signals.currentMaxJobs) {
            const waitingUnprioritized = findLastIndex(
                jobs,
                (job) => !job.prioritized && job.status !== JobStatus.IN_PROGRESS,
            );
            const waiting = findLastIndex(jobs, (job) => job.status !== JobStatus.IN_PROGRESS);
            const evictIndex =
                waitingUnprioritized >= 0 ? waitingUnprioritized : waiting >= 0 ? waiting : jobs.length - 1;
            jobs.splice(evictIndex, 1);
        }
    }

    /**
     * The highest scan level worth working towards. `SNAPSHOT` and `FULL` mean systems and damage;
     * an asteroid or a shell has neither, so identifying it is all there is to learn.
     */
    private scanCeiling(targetId: string): ScanLevel {
        const target = this.spaceManager.state.get(targetId);
        return target && Spaceship.isInstance(target) ? ScanLevel.FULL : ScanLevel.BASIC;
    }

    /**
     * A job is terminal when nothing can ever come of it again: its target is gone, or the target
     * has reached its scan ceiling and can never demote back below it (only `FULL` demotes). A
     * terminal job is removed even when prioritized.
     */
    private isJobTerminal(job: SignalsJob): boolean {
        const target = this.spaceManager.state.get(job.targetId);
        if (!target || target.destroyed) {
            return true;
        }
        return (
            !Spaceship.isInstance(target) &&
            this.spaceManager.factionIntel.getScanLevel(job.targetId, this.state.faction) >= ScanLevel.BASIC
        );
    }

    /**
     * A job is workable when the station can make progress on it right now: the target is in the
     * ship's field of view and still has something left to reveal. A job that is not workable lies
     * dormant — in place if prioritized, pruned otherwise.
     */
    private isJobWorkable(job: SignalsJob): boolean {
        if (!this.spaceManager.isVisible(this.state.id, job.targetId)) {
            return false;
        }
        return (
            this.spaceManager.factionIntel.getScanLevel(job.targetId, this.state.faction) <
            this.scanCeiling(job.targetId)
        );
    }

    /**
     * The station always works the first workable job in the queue. A job that loses the working
     * slot (displaced by a prioritized job, or its target slipping out of sight) loses all
     * progress — progress only survives while a job stays active. Every job that is not the active
     * one is marked `QUEUED` or `DORMANT` by whether the station could work it, so a client can
     * tell a genuinely next-up job from one that will be skipped.
     */
    private updateActiveJob(): SignalsJob | undefined {
        const jobs = this.state.signals.jobs;
        let active: SignalsJob | undefined;
        for (const job of jobs) {
            const workable = this.isJobWorkable(job);
            if (workable && !active) {
                active = job;
                job.status = JobStatus.IN_PROGRESS;
                continue;
            }
            if (job.status === JobStatus.IN_PROGRESS) {
                job.progress = 0;
            }
            job.status = workable ? JobStatus.QUEUED : JobStatus.DORMANT;
        }
        return active;
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
        // a prioritized job is a standing order: it stays at its queue position with fresh
        // progress and lies dormant until the target demotes, rather than being removed
        if (job.prioritized && !this.isJobTerminal(job)) {
            job.progress = 0;
        } else {
            this.removeJob(job.id);
        }
        this.updateActiveJob();
    }

    private applyScanPromotion(targetId: string): void {
        const level = this.spaceManager.factionIntel.getScanLevel(targetId, this.state.faction);
        if (level < this.scanCeiling(targetId)) {
            const next = level === ScanLevel.UFO ? ScanLevel.BASIC : ScanLevel.FULL;
            this.spaceManager.factionIntel.setScanLevel(targetId, this.state.faction, next);
        }
    }

    /**
     * Scan jobs are auto-managed: every space object in this ship's field of view still below its
     * scan ceiling gets a scan job appended to the end of the queue. A job whose target left the
     * field of view (or reached its ceiling) is dropped — unless it was prioritized, in which case
     * it lies dormant in place so the queue order of prioritized jobs survives sight loss. Only a
     * terminal job (target destroyed, or a non-ship identified to BASIC) is dropped regardless.
     * Players prioritize by moving jobs to the top of the queue; a cancelled job re-enters at the
     * end of the queue while its target stays visible.
     */
    private updateScanJobs(): void {
        const jobs = this.state.signals.jobs;
        for (let i = jobs.length - 1; i >= 0; i--) {
            const job = jobs[i];
            if (this.isJobTerminal(job) || (!job.prioritized && !this.isJobWorkable(job))) {
                jobs.splice(i, 1);
            }
        }
        for (const target of this.spaceManager.state) {
            if (jobs.length >= this.state.signals.currentMaxJobs) {
                break;
            }
            if (target.id === this.state.id || target.destroyed || isSensorInvisible(target)) {
                continue;
            }
            if (
                this.spaceManager.factionIntel.getScanLevel(target.id, this.state.faction) >=
                this.scanCeiling(target.id)
            ) {
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
