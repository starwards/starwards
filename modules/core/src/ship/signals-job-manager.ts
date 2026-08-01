import { IterationData, Updateable } from '../updateable';

import { JobStatus, SignalsJob } from './signals-job';

import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';

const TIER1_DWELL_SECONDS = 5;

export class SignalsJobManager implements Updateable {
    // Ephemeral per-target dwell timers for tier-1 passive scan promotion
    private tier1DwellTimers = new Map<string, number>();

    constructor(
        private state: ShipState,
        private spaceManager: SpaceManager,
    ) {}

    update({ deltaSeconds }: IterationData): void {
        this.processCancelJobCommand();
        this.trimExcessJobs();
        this.processJobQueue(deltaSeconds);
        this.updateTier1ScanPromotion(deltaSeconds);
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
            this.promoteNextJob();
        }
    }

    private trimExcessJobs(): void {
        const maxJobs = this.state.signals.currentMaxJobs;
        while (this.state.signals.jobs.length > maxJobs) {
            const lastIndex = this.findLastQueuedJobIndex();
            if (lastIndex >= 0) {
                this.state.signals.jobs.splice(lastIndex, 1);
            } else {
                this.state.signals.jobs.splice(this.state.signals.jobs.length - 1, 1);
            }
        }
    }

    private processJobQueue(deltaSeconds: number): void {
        const activeJob = this.getActiveJob();
        if (!activeJob) {
            return;
        }

        if (!this.spaceManager.isVisible(this.state.id, activeJob.targetId)) {
            this.removeJob(activeJob.id);
            this.promoteNextJob();
            return;
        }

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
        this.applyJobSuccess(job);
        this.removeJob(job.id);
        this.promoteNextJob();
    }

    private applyJobSuccess(job: SignalsJob): void {
        const currentLevel = this.spaceManager.getScanLevel(job.targetId, this.state.faction);
        if (currentLevel === ScanLevel.UFO) {
            this.spaceManager.setScanLevel(job.targetId, this.state.faction, ScanLevel.BASIC);
        } else if (currentLevel === ScanLevel.BASIC) {
            this.spaceManager.setScanLevel(job.targetId, this.state.faction, ScanLevel.ADVANCED);
        }
    }

    private updateTier1ScanPromotion(deltaSeconds: number): void {
        const seenIds = new Set<string>();
        for (const target of this.spaceManager.state.getAll('Spaceship')) {
            if (target.id === this.state.id) continue;
            const visible = this.spaceManager.isVisible(this.state.id, target.id);
            const scanLevel = this.spaceManager.getScanLevel(target.id, this.state.faction);
            if (visible && scanLevel === ScanLevel.UFO) {
                seenIds.add(target.id);
                const dwell = (this.tier1DwellTimers.get(target.id) ?? 0) + deltaSeconds;
                if (dwell >= TIER1_DWELL_SECONDS) {
                    this.spaceManager.setScanLevel(target.id, this.state.faction, ScanLevel.BASIC);
                    this.tier1DwellTimers.delete(target.id);
                } else {
                    this.tier1DwellTimers.set(target.id, dwell);
                }
            }
        }
        // TODO B7: reset timer on leaving range (re-entry rule undecided)
        for (const id of this.tier1DwellTimers.keys()) {
            if (!seenIds.has(id)) {
                this.tier1DwellTimers.delete(id);
            }
        }
    }

    private getSignalsEffectiveness(): number {
        return this.state.signals.effectiveness * this.state.signals.jobSpeedFactor;
    }

    private getActiveJob(): SignalsJob | null {
        for (const job of this.state.signals.jobs) {
            if (job.status === JobStatus.IN_PROGRESS) {
                return job;
            }
        }
        return null;
    }

    private promoteNextJob(): void {
        for (const job of this.state.signals.jobs) {
            if (job.status === JobStatus.QUEUED) {
                job.status = JobStatus.IN_PROGRESS;
                return;
            }
        }
    }

    private findJobIndex(jobId: string): number {
        for (let i = 0; i < this.state.signals.jobs.length; i++) {
            if (this.state.signals.jobs[i].id === jobId) {
                return i;
            }
        }
        return -1;
    }

    private findLastQueuedJobIndex(): number {
        for (let i = this.state.signals.jobs.length - 1; i >= 0; i--) {
            if (this.state.signals.jobs[i].status === JobStatus.QUEUED) {
                return i;
            }
        }
        return -1;
    }

    private removeJob(jobId: string): void {
        const index = this.findJobIndex(jobId);
        if (index >= 0) {
            this.state.signals.jobs.splice(index, 1);
        }
    }
}
