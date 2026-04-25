import { HackLevel, SystemState } from './system';
import { IterationData, Updateable } from '../updateable';
import { JobStatus, JobType, SignalsJob } from './signals-job';

import { Die } from './ship-manager-abstract';
import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';
import { XY } from '../logic';
import { makeId } from '../id';

type IncomingHack = {
    systemName: string;
    expiresAtSeconds: number;
};

type HackCooldown = {
    targetShipId: string;
    systemName: string;
    expiresAtSeconds: number;
};

interface ShipManagerRef {
    state: ShipState;
    signalsJobManager: SignalsJobManager;
}

function getSystemByName(state: ShipState, name: string): SystemState | null {
    if (!name || !Object.prototype.hasOwnProperty.call(state, name)) {
        return null;
    }
    const value = (state as unknown as Record<string, unknown>)[name];
    return value instanceof SystemState ? value : null;
}

export class SignalsJobManager implements Updateable {
    // Not persisted: lost on server restart (hacked systems stay COMPROMISED until manually reset)
    private incomingHacks: IncomingHack[] = [];
    private hackCooldowns: HackCooldown[] = [];

    constructor(
        private state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
        private ships?: Map<string, ShipManagerRef>,
    ) {}

    public registerIncomingHack(systemName: string, expiresAtSeconds: number): void {
        this.incomingHacks = this.incomingHacks.filter((h) => h.systemName !== systemName);
        this.incomingHacks.push({ systemName, expiresAtSeconds });
    }

    update({ deltaSeconds, totalSeconds }: IterationData): void {
        this.processSubmitJobCommand(totalSeconds);
        this.processCancelJobCommand();
        this.processTrackCommands();
        this.expireIncomingHacks(totalSeconds);
        this.expireHackCooldowns(totalSeconds);
        this.trimExcessJobs();
        this.processJobQueue(deltaSeconds, totalSeconds);
        this.validateTrackedTargets();
    }

    private processSubmitJobCommand(totalSeconds: number): void {
        if (!this.state.signals.submitJobCommand) {
            return;
        }
        this.state.signals.submitJobCommand = false;

        const jobType = this.state.signals.queueJobType;
        const targetId = this.state.signals.queueJobTargetId;
        const hackSystemName = this.state.signals.queueJobHackSystemName;

        this.state.signals.queueJobType = -1;
        this.state.signals.queueJobTargetId = '';
        this.state.signals.queueJobHackSystemName = '';

        if (jobType !== (JobType.SCAN as number) && jobType !== (JobType.HACK as number)) {
            return;
        }
        if (!targetId) {
            return;
        }

        if (this.state.signals.jobs.length >= this.state.signals.currentMaxJobs) {
            return;
        }

        if (!this.spaceManager.canScan(this.state.id, targetId)) {
            return;
        }

        if (jobType === (JobType.HACK as number)) {
            const scanLevel = this.spaceManager.getScanLevel(targetId, this.state.faction);
            if (scanLevel < ScanLevel.ADVANCED) {
                return;
            }

            if (!hackSystemName || !this.isValidHackTarget(targetId, hackSystemName)) {
                return;
            }

            if (this.isOnHackCooldown(targetId, hackSystemName, totalSeconds)) {
                return;
            }
        }

        const job = new SignalsJob();
        job.id = makeId();
        job.jobType = jobType;
        job.targetId = targetId;
        job.hackSystemName = jobType === (JobType.HACK as number) ? hackSystemName : '';
        job.status = JobStatus.QUEUED;
        job.progress = 0;
        job.duration = this.calculateJobDuration(jobType, targetId);

        this.state.signals.jobs.push(job);

        if (this.state.signals.jobs.length === 1) {
            job.status = JobStatus.IN_PROGRESS;
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
            this.promoteNextJob();
        }
    }

    private processTrackCommands(): void {
        const activateId = this.state.signals.activateTrackTargetId;
        if (activateId) {
            this.state.signals.activateTrackTargetId = '';

            if (
                this.state.signals.trackedTargets.length < this.state.signals.design.maxTrackedTargets &&
                !this.state.signals.trackedTargets.includes(activateId) &&
                this.isTargetInRange(activateId)
            ) {
                const scanLevel = this.spaceManager.getScanLevel(activateId, this.state.faction);
                if (scanLevel >= ScanLevel.BASIC) {
                    this.state.signals.trackedTargets.push(activateId);
                    this.spaceManager.setTrack(this.state.id, this.state.faction, activateId, true);
                }
            }
        }

        const deactivateId = this.state.signals.deactivateTrackTargetId;
        if (deactivateId) {
            this.state.signals.deactivateTrackTargetId = '';

            const idx = this.state.signals.trackedTargets.indexOf(deactivateId);
            if (idx >= 0) {
                this.state.signals.trackedTargets.splice(idx, 1);
                this.spaceManager.setTrack(this.state.id, this.state.faction, deactivateId, false);
            }
        }
    }

    private expireIncomingHacks(totalSeconds: number): void {
        this.incomingHacks = this.incomingHacks.filter((hack) => {
            if (totalSeconds >= hack.expiresAtSeconds) {
                const system = getSystemByName(this.state, hack.systemName);
                if (system) {
                    system.hacked = HackLevel.OK;
                }
                return false;
            }
            return true;
        });
    }

    private expireHackCooldowns(totalSeconds: number): void {
        this.hackCooldowns = this.hackCooldowns.filter((cd) => totalSeconds < cd.expiresAtSeconds);
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

    private processJobQueue(deltaSeconds: number, totalSeconds: number): void {
        const activeJob = this.getActiveJob();
        if (!activeJob) {
            return;
        }

        if (!this.spaceManager.canScan(this.state.id, activeJob.targetId)) {
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
            this.completeJob(activeJob, totalSeconds);
        }
    }

    private completeJob(job: SignalsJob, totalSeconds: number): void {
        const baseSuccessRate =
            job.jobType === JobType.SCAN
                ? this.state.signals.design.scanBaseSuccessRate
                : this.state.signals.design.hackBaseSuccessRate;
        // effectiveness = power * hacked: if this ship's signals system is itself hacked, jobs succeed less
        const actualSuccessRate =
            baseSuccessRate * this.state.signals.jobSuccessFactor * this.state.signals.effectiveness;
        const success = this.die.getRoll('signalsJob_' + job.id) < actualSuccessRate;

        if (success) {
            this.applyJobSuccess(job, totalSeconds);
        }

        this.removeJob(job.id);
        this.promoteNextJob();
    }

    private applyJobSuccess(job: SignalsJob, totalSeconds: number): void {
        if (job.jobType === JobType.SCAN) {
            const currentLevel = this.spaceManager.getScanLevel(job.targetId, this.state.faction);
            if (currentLevel === ScanLevel.UFO) {
                this.spaceManager.setScanLevel(job.targetId, this.state.faction, ScanLevel.BASIC);
            } else if (currentLevel === ScanLevel.BASIC) {
                this.spaceManager.setScanLevel(job.targetId, this.state.faction, ScanLevel.ADVANCED);
            }
        } else if (job.jobType === JobType.HACK) {
            this.applyHack(job.targetId, job.hackSystemName, totalSeconds);
        }
    }

    private applyHack(targetId: string, systemName: string, totalSeconds: number): void {
        if (!this.ships) {
            return;
        }
        const targetShipEntry = this.ships.get(targetId);
        if (!targetShipEntry) {
            return;
        }

        const targetSystem = getSystemByName(targetShipEntry.state, systemName);
        if (!targetSystem) {
            return;
        }

        targetSystem.hacked = HackLevel.COMPROMISED;

        targetShipEntry.signalsJobManager.registerIncomingHack(
            systemName,
            totalSeconds + this.state.signals.design.hackEffectDuration,
        );

        this.hackCooldowns.push({
            targetShipId: targetId,
            systemName,
            expiresAtSeconds: totalSeconds + this.state.signals.design.hackCooldown,
        });
    }

    private validateTrackedTargets(): void {
        for (let i = this.state.signals.trackedTargets.length - 1; i >= 0; i--) {
            const targetId = this.state.signals.trackedTargets[i];
            if (!this.isTargetInRange(targetId)) {
                this.state.signals.trackedTargets.splice(i, 1);
                this.spaceManager.setTrack(this.state.id, this.state.faction, targetId, false);
            }
        }
    }

    private isTargetInRange(targetId: string): boolean {
        const [target] = this.spaceManager.getObjectPtr(targetId);
        if (!target || target.destroyed) {
            return false;
        }
        const distance = XY.lengthOf(XY.difference(this.state.position, target.position));
        return distance <= this.state.radarRange;
    }

    private isValidHackTarget(targetId: string, systemName: string): boolean {
        if (!this.ships) {
            return false;
        }
        const targetShipEntry = this.ships.get(targetId);
        if (!targetShipEntry) {
            return false;
        }
        return getSystemByName(targetShipEntry.state, systemName) !== null;
    }

    private calculateJobDuration(jobType: JobType, targetId: string): number {
        if (jobType === JobType.SCAN) {
            const currentLevel = this.spaceManager.getScanLevel(targetId, this.state.faction);
            const baseDuration = this.state.signals.design.scanBaseDuration;
            return currentLevel >= ScanLevel.BASIC
                ? baseDuration * this.state.signals.design.scanAdvancedFactor
                : baseDuration;
        }
        return this.state.signals.design.hackBaseDuration;
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

    private isOnHackCooldown(targetId: string, systemName: string, totalSeconds: number): boolean {
        return this.hackCooldowns.some(
            (cd) => cd.targetShipId === targetId && cd.systemName === systemName && totalSeconds < cd.expiresAtSeconds,
        );
    }
}
