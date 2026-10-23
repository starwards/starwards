import { ScanLevel } from '@starwards/core';

/**
 * The level a scan job on a target at `level` is working towards. Identification takes a contact
 * from UFO to BASIC; a deep scan takes it from BASIC (or a decayed SNAPSHOT) straight to FULL.
 */
export function scanStepTarget(level: ScanLevel): ScanLevel {
    return level === ScanLevel.UFO ? ScanLevel.BASIC : ScanLevel.FULL;
}

/** Job-row suffix naming the step the job is working on, e.g. `→FULL`. */
export function scanStepLabel(level: ScanLevel): string {
    return `→${ScanLevel[scanStepTarget(level)]}`;
}

/** How long a target stays watched after its job leaves the queue, so a completion whose level
 * update arrives after the job's removal is still caught. */
export const PROMOTION_WATCH_MS = 2000;

/**
 * Watches the scan levels of the job queue's targets and reports each target whose level rose since
 * the last observation, with the level reached. A target whose job left the queue stays watched
 * for `PROMOTION_WATCH_MS`, since a finished non-prioritized job is removed. Demotions and targets
 * gone from space are never reported.
 */
export class PromotionWatch {
    private watched = new Map<string, { level: ScanLevel; seenAt: number }>();

    observe(jobTargets: Iterable<string>, levelOf: (targetId: string) => ScanLevel | undefined, now: number) {
        const promotions: { targetId: string; level: ScanLevel }[] = [];
        const inQueue = new Set(jobTargets);
        for (const targetId of inQueue) {
            if (!this.watched.has(targetId)) {
                const level = levelOf(targetId);
                if (level !== undefined) {
                    this.watched.set(targetId, { level, seenAt: now });
                }
            }
        }
        for (const [targetId, entry] of this.watched) {
            const level = levelOf(targetId);
            if (level === undefined || (!inQueue.has(targetId) && now - entry.seenAt > PROMOTION_WATCH_MS)) {
                this.watched.delete(targetId);
                continue;
            }
            if (level > entry.level) {
                promotions.push({ targetId, level });
            }
            this.watched.set(targetId, { level, seenAt: inQueue.has(targetId) ? now : entry.seenAt });
        }
        return promotions;
    }
}
