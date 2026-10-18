type XY = { x: number; y: number };

/** A missile arms this far from the tube: a target nearer than this takes the blast unarmed. */
export const MISSILE_MIN_LAUNCH_METERS = 1000;

/** Measured target speeds, m/s: a dragonfly-MK1 at cruise and at afterburner. */
const SPEEDS = [-1200, -600, 0, 600, 1200] as const;

type Envelope = {
    /** Rmax by closing speed (one entry per {@link SPEEDS}): a non-maneuvering target flying straight along the line of sight. */
    byClosing: readonly number[];
    /** By crossing speed 600 and 1200 m/s, square to the line of sight: a crossing target limits Rmax further. */
    byCrossing: readonly number[];
};

/**
 * Farthest launch at which one missile hits a dragonfly-MK1 at least 4 times in 5, seeds 1-8, sweep
 * capped at 70 km (`npm --prefix modules/server run missile-range`, table in
 * `modules/ai/curriculum/lessons.md`). Rmax: the target holds its course and speed. Rne (no-escape)
 * is the entry for a target opening at cruise speed; at afterburner speed it outruns every missile.
 */
const ENVELOPES: Record<string, Envelope> = {
    HiExpMissile: { byClosing: [0, 4_000, 45_000, 70_000, 70_000], byCrossing: [10_000, 0] },
    ArmPenMissile: { byClosing: [0, 15_000, 40_000, 65_000, 70_000], byCrossing: [30_000, 0] },
    ElecMissile: { byClosing: [0, 15_000, 70_000, 70_000, 70_000], byCrossing: [40_000, 0] },
};

/** The measured value at `speed`: the shorter of the two measured neighbours, the end value past the ends. */
function shorterNeighbour(speeds: readonly number[], ranges: readonly number[], speed: number) {
    const above = speeds.findIndex((s) => s >= speed);
    if (above === -1) {
        return ranges[ranges.length - 1];
    }
    if (speeds[above] === speed || above === 0) {
        return ranges[above];
    }
    return Math.min(ranges[above - 1], ranges[above]);
}

/**
 * The farthest range to launch `ammo` at a target closing at `closing` m/s (negative: opening) and
 * crossing the line of sight at `crossing` m/s. Between measured closing speeds it takes the shorter
 * neighbour; crossing speed shortens that range linearly toward the measured crossing ranges, so a
 * few m/s of noise in a radar fix costs a few hundred metres, not the still-target range. 0 for an ammo
 * without one. Single source for the reference weapons' launch, the captain's close order and the
 * analysis of where launches left.
 */
export function missileLaunchRange(ammo: string, closing: number, crossing = 0) {
    const envelope = ENVELOPES[ammo];
    if (!envelope) {
        return 0;
    }
    const ranges = [shorterNeighbour(SPEEDS, envelope.byClosing, closing), ...envelope.byCrossing];
    const across = Math.min(Math.abs(crossing), 1200) / 600;
    const i = Math.min(Math.floor(across), 1);
    return Math.min(ranges[0], ranges[i] + (ranges[i + 1] - ranges[i]) * (across - i));
}

/**
 * How fast a target closes (positive) or opens, and how fast it crosses the line of sight, from two
 * fixes of its position relative to the own ship `seconds` apart.
 */
export function rangeRate(before: XY, now: XY, seconds: number) {
    const v = { x: (now.x - before.x) / seconds, y: (now.y - before.y) / seconds };
    const d = Math.hypot(now.x, now.y) || 1;
    const radial = (v.x * now.x + v.y * now.y) / d;
    return { closing: -radial || 0, crossing: Math.abs((v.y * now.x - v.x * now.y) / d) };
}
