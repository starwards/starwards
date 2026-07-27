import { HackLevel, SystemState } from './system';
import { IterationData, Updateable } from '../updateable';
import { JobStatus, JobType, SignalsJob } from './signals-job';

import { ArraySchema } from '@colyseus/schema';
import { Die } from './ship-manager-abstract';
import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';
import { makeId } from '../id';

const TIER1_DWELL_SECONDS = 5;

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

/**
 * Resolves a hack target name to a system. A name is either a ShipState field holding a single
 * system (`'reactor'`) or a field holding a collection plus an index (`'radars/0'`).
 */
function getSystemByName(state: ShipState, name: string): SystemState | null {
    if (!name) {
        return null;
    }
    const [field, index, ...excess] = name.split('/');
    if (excess.length > 0 || !Object.prototype.hasOwnProperty.call(state, field)) {
        return null;
    }
    const value = (state as unknown as Record<string, unknown>)[field];
    if (value instanceof ArraySchema) {
        const item = index === undefined ? undefined : (value as ArraySchema<unknown>).at(Number(index));
        return item instanceof SystemState ? item : null;
    }
    return index === undefined && value instanceof SystemState ? value : null;
}

export class SignalsJobManager implements Updateable {
    // Not persisted: lost on server restart (hacked systems stay COMPROMISED until manually reset)
    private incomingHacks: IncomingHack[] = [];
    private hackCooldowns: HackCooldown[] = [];
    // Ephemeral per-target dwell timers for tier-1 passive scan promotion
    private tier1DwellTimers = new Map<string, number>();

    constructor(
        private state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
        private ships?: Map<string, ShipManagerRef>,
    ) {}

    // Last-writer-wins: if two ships hack the same system, the latest expiry replaces the earlier one
    public registerIncomingHack(systemName: string, expiresAtSeconds: number): void {
        this.incomingHacks = this.incomingHacks.filter((h) => h.systemName !== systemName);
        this.incomingHacks.push({ systemName, expiresAtSeconds });
    }

    update({ deltaSeconds, totalSeconds }: IterationData): void {
        this.processSubmitJobCommand(totalSeconds);
        this.processCancelJobCommand();
        this.expireIncomingHacks(totalSeconds);
        this.expireHackCooldowns(totalSeconds);
        this.trimExcessJobs();
        this.processJobQueue(deltaSeconds, totalSeconds);
        this.updateTier1ScanPromotion(deltaSeconds);
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

        const validJobType = jobType;
        if (validJobType !== JobType.SCAN && validJobType !== JobType.HACK) {
            return;
        }
        if (!targetId) {
            return;
        }

        if (this.state.signals.jobs.length >= this.state.signals.currentMaxJobs) {
            return;
        }

        if (!this.spaceManager.isVisible(this.state.id, targetId)) {
            return;
        }

        const scanLevel = this.spaceManager.getScanLevel(targetId, this.state.faction);

        if (validJobType === JobType.SCAN) {
            // scan jobs only take a target from UFO to BASIC; SNAPSHOT/FULL come from the
            // line-of-sight promotion/demotion cycle (SpaceManager.updateScanPromotion)
            if (scanLevel >= ScanLevel.BASIC) {
                return;
            }
        }

        if (validJobType === JobType.HACK) {
            if (scanLevel < ScanLevel.SNAPSHOT) {
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
        job.jobType = validJobType;
        job.targetId = targetId;
        job.hackSystemName = validJobType === JobType.HACK ? hackSystemName : '';
        job.status = JobStatus.QUEUED;
        job.progress = 0;
        job.duration = this.calculateJobDuration(validJobType);

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
            // scan jobs top out at BASIC; submission is already gated on scanLevel < BASIC
            this.spaceManager.setScanLevel(job.targetId, this.state.faction, ScanLevel.BASIC);
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

    private calculateJobDuration(jobType: JobType): number {
        // scan job submission is gated on scanLevel < BASIC, so a scan job is always
        // starting from UFO — no need for a per-level duration factor here
        return jobType === JobType.SCAN
            ? this.state.signals.design.scanBaseDuration
            : this.state.signals.design.hackBaseDuration;
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
