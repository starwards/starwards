import { HackLevel, SystemState } from './system';
import { IterationData, Updateable } from '../updateable';
import { JobStatus, JobType, SignalsJob } from './signals-job';

import { Die } from './ship-manager-abstract';
import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';
import { XY } from '../logic';
import { makeId } from '../id';

type ActiveHack = {
    targetShipId: string;
    systemName: string;
    expiresAtSeconds: number;
};

type HackCooldown = {
    targetShipId: string;
    systemName: string;
    expiresAtSeconds: number;
};

// System field names on ShipState that can be hacked
const HACKABLE_SYSTEMS = [
    'chainGun',
    'radar',
    'reactor',
    'smartPilot',
    'warp',
    'docking',
    'maneuvering',
    'signals',
] as const;

function isHackableSystem(name: string): boolean {
    return (HACKABLE_SYSTEMS as readonly string[]).includes(name);
}

function getSystemByName(state: ShipState, name: string): SystemState | null {
    if (!isHackableSystem(name)) {
        return null;
    }
    const system = state[name as keyof ShipState];
    if (system instanceof SystemState) {
        return system;
    }
    return null;
}

export class SignalsJobManager implements Updateable {
    private activeHacks: ActiveHack[] = [];
    private hackCooldowns: HackCooldown[] = [];

    constructor(
        private state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
        private ships?: Map<string, { state: ShipState }>,
    ) {}

    update({ deltaSeconds, totalSeconds }: IterationData): void {
        this.processSubmitJobCommand(totalSeconds);
        this.processCancelJobCommand();
        this.processTrackCommands();
        this.expireHacks(totalSeconds);
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

        // Reset command fields
        this.state.signals.queueJobType = '';
        this.state.signals.queueJobTargetId = '';
        this.state.signals.queueJobHackSystemName = '';

        if (jobType !== (JobType.SCAN as string) && jobType !== (JobType.HACK as string)) {
            return;
        }
        if (!targetId) {
            return;
        }

        // Validate queue not full
        if (this.state.signals.jobs.length >= this.state.signals.currentMaxJobs) {
            return;
        }

        // Validate target exists and is in range
        if (!this.spaceManager.canScan(this.state.id, targetId)) {
            return;
        }

        // Hack-specific validation
        if (jobType === (JobType.HACK as string)) {
            // Hack requires scan level 2 (ADVANCED)
            const scanLevel = this.spaceManager.getScanLevel(targetId, this.state.faction);
            if (scanLevel < ScanLevel.ADVANCED) {
                return;
            }

            // Must specify a valid system to hack
            if (!hackSystemName || !isHackableSystem(hackSystemName)) {
                return;
            }

            // Check hack cooldown
            if (this.isOnHackCooldown(targetId, hackSystemName, totalSeconds)) {
                return;
            }
        }

        // Create and queue the job
        const job = new SignalsJob();
        job.id = makeId();
        job.jobType = jobType;
        job.targetId = targetId;
        job.hackSystemName = jobType === (JobType.HACK as string) ? hackSystemName : '';
        job.status = JobStatus.QUEUED;
        job.progress = 0;
        job.duration = this.calculateJobDuration(jobType, targetId);

        this.state.signals.jobs.push(job);

        // Start immediately if this is the only job
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
            // If we cancelled the active job and there's another, start it
            this.promoteNextJob();
        }
    }

    private processTrackCommands(): void {
        // Activate track
        const activateId = this.state.signals.activateTrackTargetId;
        if (activateId) {
            this.state.signals.activateTrackTargetId = '';

            if (
                this.state.signals.trackedTargets.length < this.state.signals.design.maxTrackedTargets &&
                !this.state.signals.trackedTargets.includes(activateId) &&
                this.isTargetInRange(activateId)
            ) {
                // Track requires at least scan level BASIC
                const scanLevel = this.spaceManager.getScanLevel(activateId, this.state.faction);
                if (scanLevel >= ScanLevel.BASIC) {
                    this.state.signals.trackedTargets.push(activateId);
                }
            }
        }

        // Deactivate track
        const deactivateId = this.state.signals.deactivateTrackTargetId;
        if (deactivateId) {
            this.state.signals.deactivateTrackTargetId = '';

            const idx = this.state.signals.trackedTargets.indexOf(deactivateId);
            if (idx >= 0) {
                this.state.signals.trackedTargets.splice(idx, 1);
            }
        }
    }

    private expireHacks(totalSeconds: number): void {
        this.activeHacks = this.activeHacks.filter((hack) => {
            if (totalSeconds >= hack.expiresAtSeconds) {
                // Restore the hacked system
                this.restoreHackedSystem(hack.targetShipId, hack.systemName);
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
            // Remove from end (last added that is queued)
            const lastIndex = this.findLastQueuedJobIndex();
            if (lastIndex >= 0) {
                this.state.signals.jobs.splice(lastIndex, 1);
            } else {
                // All jobs are in progress, remove the last one anyway
                this.state.signals.jobs.splice(this.state.signals.jobs.length - 1, 1);
            }
        }
    }

    private processJobQueue(deltaSeconds: number, totalSeconds: number): void {
        const activeJob = this.getActiveJob();
        if (!activeJob) {
            return;
        }

        // Validate target still in range
        if (!this.spaceManager.canScan(this.state.id, activeJob.targetId)) {
            this.removeJob(activeJob.id);
            this.promoteNextJob();
            return;
        }

        // Check effectiveness - no progress if broken
        const effectiveness = this.getSignalsEffectiveness();
        if (effectiveness <= 0) {
            return;
        }

        // Advance progress
        const effectiveDuration = activeJob.duration / effectiveness;
        const progressIncrement = deltaSeconds / effectiveDuration;
        activeJob.progress = Math.min(1, activeJob.progress + progressIncrement);

        if (activeJob.progress >= 1) {
            this.completeJob(activeJob, totalSeconds);
        }
    }

    private completeJob(job: SignalsJob, totalSeconds: number): void {
        // Roll for success
        const baseSuccessRate =
            job.jobType === (JobType.SCAN as string)
                ? this.state.signals.design.scanBaseSuccessRate
                : this.state.signals.design.hackBaseSuccessRate;
        const actualSuccessRate =
            baseSuccessRate * this.state.signals.jobSuccessFactor * this.state.signals.effectiveness;
        const success = this.die.getRoll('signalsJob_' + job.id) < actualSuccessRate;

        if (success) {
            this.applyJobSuccess(job, totalSeconds);
        }

        // Remove completed job from queue
        this.removeJob(job.id);
        this.promoteNextJob();
    }

    private applyJobSuccess(job: SignalsJob, totalSeconds: number): void {
        if (job.jobType === (JobType.SCAN as string)) {
            const currentLevel = this.spaceManager.getScanLevel(job.targetId, this.state.faction);
            if (currentLevel === ScanLevel.UFO) {
                this.spaceManager.setScanLevel(job.targetId, this.state.faction, ScanLevel.BASIC);
            } else if (currentLevel === ScanLevel.BASIC) {
                this.spaceManager.setScanLevel(job.targetId, this.state.faction, ScanLevel.ADVANCED);
            }
        } else if (job.jobType === (JobType.HACK as string)) {
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

        this.activeHacks.push({
            targetShipId: targetId,
            systemName,
            expiresAtSeconds: totalSeconds + this.state.signals.design.hackEffectDuration,
        });

        this.hackCooldowns.push({
            targetShipId: targetId,
            systemName,
            expiresAtSeconds: totalSeconds + this.state.signals.design.hackCooldown,
        });
    }

    private restoreHackedSystem(targetShipId: string, systemName: string): void {
        if (!this.ships) {
            return;
        }
        const targetShipEntry = this.ships.get(targetShipId);
        if (!targetShipEntry) {
            return;
        }

        const targetSystem = getSystemByName(targetShipEntry.state, systemName);
        if (targetSystem) {
            targetSystem.hacked = HackLevel.OK;
        }
    }

    private validateTrackedTargets(): void {
        for (let i = this.state.signals.trackedTargets.length - 1; i >= 0; i--) {
            const targetId = this.state.signals.trackedTargets[i];
            const [target] = this.spaceManager.getObjectPtr(targetId);
            if (!target || target.destroyed) {
                this.state.signals.trackedTargets.splice(i, 1);
                continue;
            }
            // Check range (tracked targets only need to be within radar range, no LOS required)
            const distance = XY.lengthOf(XY.difference(this.state.position, target.position));
            if (distance > this.state.radarRange) {
                this.state.signals.trackedTargets.splice(i, 1);
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

    private calculateJobDuration(jobType: string, targetId: string): number {
        if (jobType === (JobType.SCAN as string)) {
            const currentLevel = this.spaceManager.getScanLevel(targetId, this.state.faction);
            const baseDuration = this.state.signals.design.scanBaseDuration;
            // Lvl1->Lvl2 takes scanAdvancedFactor times longer
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
            if (job.status === (JobStatus.IN_PROGRESS as string)) {
                return job;
            }
        }
        return null;
    }

    private promoteNextJob(): void {
        for (const job of this.state.signals.jobs) {
            if (job.status === (JobStatus.QUEUED as string)) {
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
            if (this.state.signals.jobs[i].status === (JobStatus.QUEUED as string)) {
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
