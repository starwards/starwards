import { HackLevel, SystemState } from './system';
import { IterationData, Updateable } from '../updateable';
import { JobStatus, JobType, SignalsJob } from './signals-job';

import { ArraySchema } from '@colyseus/schema';
import { Die } from './ship-manager-abstract';
import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';
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

function findLastIndex<T>(items: ArraySchema<T>, predicate: (item: T) => boolean): number | null {
    for (let i = items.length - 1; i >= 0; i--) {
        if (predicate(items[i])) {
            return i;
        }
    }
    return null;
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

    // Last-writer-wins: if two ships hack the same system, the latest expiry replaces the earlier one
    public registerIncomingHack(systemName: string, expiresAtSeconds: number): void {
        this.incomingHacks = this.incomingHacks.filter((h) => h.systemName !== systemName);
        this.incomingHacks.push({ systemName, expiresAtSeconds });
    }

    update({ deltaSeconds, totalSeconds }: IterationData): void {
        this.processSubmitJobCommand(totalSeconds);
        this.processCancelJobCommand();
        this.processPrioritizeJobCommand();
        this.expireIncomingHacks(totalSeconds);
        this.expireHackCooldowns(totalSeconds);
        this.updateScanJobs();
        this.trimExcessJobs();
        const activeJob = this.updateActiveJob();
        if (activeJob && !this.state.signals.jobsPaused) {
            this.processJobQueue(activeJob, deltaSeconds, totalSeconds);
        }
    }

    private processSubmitJobCommand(totalSeconds: number): void {
        if (!this.state.signals.submitJobCommand) {
            return;
        }
        this.state.signals.submitJobCommand = false;

        const targetId = this.state.signals.queueJobTargetId;
        const hackSystemName = this.state.signals.queueJobHackSystemName;

        this.state.signals.queueJobTargetId = '';
        this.state.signals.queueJobHackSystemName = '';

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
        if (scanLevel < ScanLevel.SNAPSHOT) {
            return;
        }

        if (!hackSystemName || !this.isValidHackTarget(targetId, hackSystemName)) {
            return;
        }

        if (this.isOnHackCooldown(targetId, hackSystemName, totalSeconds)) {
            return;
        }

        this.pushJob(JobType.HACK, targetId, hackSystemName);
    }

    private pushJob(jobType: JobType, targetId: string, hackSystemName = ''): SignalsJob {
        const job = new SignalsJob();
        job.id = makeId();
        job.jobType = jobType;
        job.targetId = targetId;
        job.hackSystemName = hackSystemName;
        job.duration = this.calculateJobDuration(jobType);

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
     * ship's field of view, and (for scans) still has something left to reveal. A prioritized job
     * that is not workable lies dormant in place instead of being pruned.
     */
    private isJobWorkable(job: SignalsJob): boolean {
        if (!this.spaceManager.isVisible(this.state.id, job.targetId)) {
            return false;
        }
        if (
            job.jobType === JobType.SCAN &&
            this.spaceManager.getScanLevel(job.targetId, this.state.faction) >= ScanLevel.FULL
        ) {
            return false;
        }
        return true;
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

    private processJobQueue(activeJob: SignalsJob, deltaSeconds: number, totalSeconds: number): void {
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
        if (job.jobType === JobType.SCAN) {
            // scans are passive and deterministic: sustaining line of sight for the job's duration
            // promotes the target one tier
            this.applyScanPromotion(job.targetId);
        } else if (job.jobType === JobType.HACK) {
            // effectiveness = power * hacked: if this ship's signals system is itself hacked, jobs succeed less
            const actualSuccessRate =
                this.state.signals.design.hackBaseSuccessRate *
                this.state.signals.jobSuccessFactor *
                this.state.signals.effectiveness;
            if (this.die.getRoll('signalsJob_' + job.id) < actualSuccessRate) {
                this.applyHack(job.targetId, job.hackSystemName, totalSeconds);
            }
        }

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

    /**
     * Scan jobs are auto-managed: every space object in this ship's field of view whose faction
     * scan level is below FULL gets a scan job appended to the end of the queue. A scan job whose
     * target left the field of view (or reached FULL) is dropped — unless it was prioritized, in
     * which case it lies dormant in place so the queue order of prioritized jobs survives sight
     * loss. Players prioritize by moving jobs to the top of the queue; a cancelled scan job
     * re-enters at the end of the queue while its target stays visible.
     */
    private updateScanJobs(): void {
        const jobs = this.state.signals.jobs;
        for (let i = jobs.length - 1; i >= 0; i--) {
            const job = jobs[i];
            if (job.jobType === JobType.SCAN && !job.prioritized && !this.isJobWorkable(job)) {
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
            if (jobs.some((job) => job.jobType === JobType.SCAN && job.targetId === target.id)) {
                continue;
            }
            if (!this.spaceManager.isVisible(this.state.id, target.id)) {
                continue;
            }
            this.pushJob(JobType.SCAN, target.id);
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
        return jobType === JobType.SCAN
            ? this.state.signals.design.scanBaseDuration
            : this.state.signals.design.hackBaseDuration;
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

    private isOnHackCooldown(targetId: string, systemName: string, totalSeconds: number): boolean {
        return this.hackCooldowns.some(
            (cd) => cd.targetShipId === targetId && cd.systemName === systemName && totalSeconds < cd.expiresAtSeconds,
        );
    }
}
