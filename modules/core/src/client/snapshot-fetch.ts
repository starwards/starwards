import { NeedSnapshotMessage, SnapshotMessage } from '../ship/ship-snapshot';

/** float32 sync rounds the `scanSnapshotCapturedAt` stamp a held snapshot is compared against */
const CAPTURED_AT_EPSILON = 0.001;

/**
 * Client side of the SPEC-0008 snapshot fetch: polls `needSnapshot` on an interval while the
 * subject has a capture (`scanSnapshotCapturedAt`) newer than the snapshot held, and stops on
 * receipt. Replies are correlated by target id only; one for a former subject is dropped.
 */
export class SnapshotFetch {
    private held: (SnapshotMessage & { receivedAt: number }) | undefined;
    private subject: { targetId: string; latestCapturedAt: number } | undefined;
    private lastSentAt = -Infinity;

    constructor(
        private send: (msg: NeedSnapshotMessage) => void,
        private now: () => number = Date.now,
        private intervalMs = 1000,
    ) {}

    /**
     * Call every frame with the current subject and its capture stamp for the player's faction.
     * @param latestCapturedAt 0 when the faction never captured the subject: nothing to fetch
     */
    update(targetId: string | undefined, latestCapturedAt: number) {
        this.subject = targetId ? { targetId, latestCapturedAt } : undefined;
        if (!targetId || latestCapturedAt <= 0 || this.snapshot) return;
        const now = this.now();
        if (now - this.lastSentAt < this.intervalMs) return;
        this.lastSentAt = now;
        const msg: NeedSnapshotMessage = { targetId };
        if (this.held?.targetId === targetId) msg.haveCapturedAt = this.held.capturedAt;
        this.send(msg);
    }

    receive(msg: SnapshotMessage) {
        if (msg.targetId !== this.subject?.targetId) return;
        this.held = { ...msg, receivedAt: this.now() };
    }

    /** The latest snapshot of the current subject, aged to now; undefined while it is missing. */
    get snapshot(): SnapshotMessage | undefined {
        const { held, subject } = this;
        if (
            !held ||
            !subject ||
            held.targetId !== subject.targetId ||
            held.capturedAt < subject.latestCapturedAt - CAPTURED_AT_EPSILON
        ) {
            return undefined;
        }
        return { ...held, ageSeconds: held.ageSeconds + (this.now() - held.receivedAt) / 1000 };
    }
}
