import { ScanLevel } from '@starwards/core';

/** Tuning for the Dradis declutter ladder (SPEC-0007 D3). Approved defaults, to be tuned at playtest. */
export const DECLUTTER = {
    /** Rung 1: furthest an icon may move from its true screen position, in px. */
    nudgePx: 16,
    /** Rung 2: smallest icon scale, as a fraction of the blip size. */
    minScale: 0.5,
    /** Scale step tried between 1 and `minScale`. */
    scaleStep: 0.05,
    /** A cluster's rung changes only after the wanted rung has been stable this long, in ms. */
    holdMs: 300,
    /** Relaxation passes the nudge rung runs before it gives up. */
    nudgeIterations: 12,
} as const;

export enum Rung {
    NONE = 0,
    NUDGE = 1,
    SHRINK = 2,
    GROUP = 3,
}

export type DeclutterItem = {
    id: string;
    /** True screen position. */
    x: number;
    y: number;
    /** What the viewer can tell about the object's type; only items of one kind group together. */
    kind: string;
    /** Exempt items (named, selected, own faction) always draw individually, full size, in place. */
    exempt: boolean;
};

export type Placement = { x: number; y: number; scale: number; visible: boolean };

export type Group = {
    /** Stable for as long as the group keeps its lowest-sorted member. */
    key: string;
    x: number;
    y: number;
    kind: string;
    memberIds: string[];
    badge: string;
};

export type DeclutterResult = {
    placements: Map<string, Placement>;
    groups: Group[];
};

/** The type a viewer may know: below BASIC every contact is the same unknown blip (SPEC-0007 D3, concealment). */
export function visibleKind(type: string, scanLevel: ScanLevel): string {
    return scanLevel >= ScanLevel.BASIC ? type : 'unknown';
}

/** Named (callsign), selected and own-faction objects are never decluttered (SPEC-0007 D3, R1, R7). */
export function isExempt(o: { named: boolean; selected: boolean; ownFaction: boolean }): boolean {
    return o.named || o.selected || o.ownFaction;
}

/** Exact count up to 9, then buckets (SPEC-0007 R4). */
export function groupBadge(count: number): string {
    if (count <= 9) return `${count}`;
    if (count < 100) return '<100';
    if (count < 1000) return '<1000';
    return '1000+';
}

type Point = { x: number; y: number };

function overlaps(a: Point, b: Point, box: number) {
    return Math.abs(a.x - b.x) < box && Math.abs(a.y - b.y) < box;
}

/**
 * Same-kind candidates whose boxes overlap, as connected components (each sorted by id).
 * `linked` joins pairs that should stay together regardless of overlap.
 */
export function findClusters(
    items: DeclutterItem[],
    box: number,
    linked: (a: DeclutterItem, b: DeclutterItem) => boolean = () => false,
): DeclutterItem[][] {
    const candidates = items.filter((i) => !i.exempt).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const seen = new Set<DeclutterItem>();
    const clusters: DeclutterItem[][] = [];
    for (const start of candidates) {
        if (seen.has(start)) continue;
        seen.add(start);
        const cluster = [start];
        for (let i = 0; i < cluster.length; i++) {
            for (const other of candidates) {
                if (
                    !seen.has(other) &&
                    other.kind === start.kind &&
                    (overlaps(cluster[i], other, box) || linked(cluster[i], other))
                ) {
                    seen.add(other);
                    cluster.push(other);
                }
            }
        }
        clusters.push(cluster.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    }
    return clusters;
}

/**
 * Pushes overlapping boxes apart along their wider-separated axis, each clamped to `maxShift`
 * from its true position. Returns the shifted positions, or null when overlap remains.
 */
export function nudge(points: Point[], box: number, maxShift: number): Point[] | null {
    const shifted = points.map((p) => ({ x: p.x, y: p.y }));
    const clamp = (i: number) => {
        const p = shifted[i];
        p.x = Math.max(points[i].x - maxShift, Math.min(points[i].x + maxShift, p.x));
        p.y = Math.max(points[i].y - maxShift, Math.min(points[i].y + maxShift, p.y));
    };
    const resolved = () => {
        for (let i = 0; i < shifted.length; i++)
            for (let j = i + 1; j < shifted.length; j++) if (overlaps(shifted[i], shifted[j], box)) return false;
        return true;
    };
    for (let pass = 0; pass < DECLUTTER.nudgeIterations && !resolved(); pass++) {
        for (let i = 0; i < shifted.length; i++) {
            for (let j = i + 1; j < shifted.length; j++) {
                const a = shifted[i];
                const b = shifted[j];
                if (!overlaps(a, b, box)) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
                const d = axis === 'x' ? dx : dy;
                // identical positions split by index, so the outcome is deterministic
                const sign = d === 0 ? 1 : Math.sign(d);
                const half = (box - Math.abs(d)) / 2 + 0.01;
                a[axis] -= sign * half;
                b[axis] += sign * half;
                clamp(i);
                clamp(j);
            }
        }
    }
    if (resolved()) return shifted;
    // keep each icon on its true position when the boxes cannot be separated within reach
    return null;
}

/** Can boxes of this size be separated with each moving at most `maxShift`? A cheap necessary test. */
function separable(points: Point[], box: number, maxShift: number) {
    for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
            const gap = Math.max(Math.abs(points[i].x - points[j].x), Math.abs(points[i].y - points[j].y));
            if (gap + 2 * maxShift < box) return false;
        }
    return true;
}

type Layout = { rung: Rung; positions: Point[]; scale: number };

/** The lowest rung that clears this cluster's overlap at the given blip size. */
function layoutAtRung(cluster: Point[], blipSize: number, rung: Rung): Layout | null {
    if (cluster.length < 2 || rung === Rung.NONE) {
        return cluster.length < 2 || !hasOverlap(cluster, blipSize)
            ? { rung: Rung.NONE, positions: cluster, scale: 1 }
            : null;
    }
    if (rung === Rung.NUDGE) {
        const positions = separable(cluster, blipSize, DECLUTTER.nudgePx)
            ? nudge(cluster, blipSize, DECLUTTER.nudgePx)
            : null;
        return positions && { rung, positions, scale: 1 };
    }
    if (rung === Rung.SHRINK) {
        for (let scale = 1; scale >= DECLUTTER.minScale - 1e-9; scale -= DECLUTTER.scaleStep) {
            const box = blipSize * scale;
            if (!separable(cluster, box, DECLUTTER.nudgePx)) continue;
            const positions = nudge(cluster, box, DECLUTTER.nudgePx);
            if (positions) return { rung, positions, scale };
        }
        return null;
    }
    return { rung: Rung.GROUP, positions: cluster, scale: 1 };
}

function hasOverlap(points: Point[], box: number) {
    for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) if (overlaps(points[i], points[j], box)) return true;
    return false;
}

/** The lowest rung that clears the overlap, or GROUP. */
export function wantedRung(cluster: Point[], blipSize: number): Rung {
    for (const rung of [Rung.NONE, Rung.NUDGE, Rung.SHRINK]) {
        if (layoutAtRung(cluster, blipSize, rung)) return rung;
    }
    return Rung.GROUP;
}

type Held = { shown: Rung; pending: Rung; since: number };

/**
 * The declutter ladder (SPEC-0007 D3), run once per frame on screen positions. Stateful only for
 * hysteresis: a member's rung changes after the wanted rung held for `DECLUTTER.holdMs`; a cluster
 * shows the highest rung any member holds.
 */
export class Declutter {
    private held = new Map<string, Held>();
    /** Group key of each member of a group drawn last frame, so a held group outlives its overlap. */
    private groupOf = new Map<string, string>();

    constructor(private readonly blipSize: number) {}

    update(items: DeclutterItem[], now: number): DeclutterResult {
        const placements = new Map<string, Placement>();
        const groups: Group[] = [];
        const nextHeld = new Map<string, Held>();
        for (const item of items) {
            placements.set(item.id, { x: item.x, y: item.y, scale: 1, visible: true });
        }
        // an icon left on its own while its group's hold runs keeps last frame's group; icons that
        // still overlap others follow this frame's clusters
        const alone = new Set(
            findClusters(items, this.blipSize)
                .filter((c) => c.length === 1)
                .map((c) => c[0].id),
        );
        const heldGroup = (i: DeclutterItem) =>
            alone.has(i.id) && this.held.get(i.id)?.shown === Rung.GROUP ? this.groupOf.get(i.id) : undefined;
        const linked = (a: DeclutterItem, b: DeclutterItem) => {
            const g = heldGroup(a);
            return g !== undefined && g === heldGroup(b);
        };
        for (const cluster of findClusters(items, this.blipSize, linked)) {
            const wanted = wantedRung(cluster, this.blipSize);
            let shown = Rung.NONE;
            for (const member of cluster) {
                const h = this.hold(member.id, wanted, now);
                nextHeld.set(member.id, h);
                shown = Math.max(shown, h.shown);
            }
            this.apply(cluster, shown, placements, groups);
        }
        this.held = nextHeld;
        this.groupOf = new Map(groups.flatMap((g) => g.memberIds.map((id) => [id, g.key] as const)));
        return { placements, groups };
    }

    private hold(id: string, wanted: Rung, now: number): Held {
        const prev = this.held.get(id);
        if (!prev) return { shown: wanted, pending: wanted, since: now };
        if (wanted === prev.shown) return { shown: wanted, pending: wanted, since: now };
        if (wanted !== prev.pending) return { shown: prev.shown, pending: wanted, since: now };
        if (now - prev.since >= DECLUTTER.holdMs) return { shown: wanted, pending: wanted, since: now };
        return prev;
    }

    private apply(cluster: DeclutterItem[], rung: Rung, placements: Map<string, Placement>, groups: Group[]) {
        if (cluster.length < 2) return;
        if (rung === Rung.GROUP) {
            const x = cluster.reduce((s, m) => s + m.x, 0) / cluster.length;
            const y = cluster.reduce((s, m) => s + m.y, 0) / cluster.length;
            for (const m of cluster) placements.set(m.id, { x: m.x, y: m.y, scale: 1, visible: false });
            groups.push({
                key: cluster[0].id,
                x,
                y,
                kind: cluster[0].kind,
                memberIds: cluster.map((m) => m.id),
                badge: groupBadge(cluster.length),
            });
            return;
        }
        // a held rung that no longer clears the overlap falls back to the true positions at the lowest scale it allows
        const layout = layoutAtRung(cluster, this.blipSize, rung) ?? {
            positions: cluster,
            scale: rung === Rung.SHRINK ? DECLUTTER.minScale : 1,
        };
        cluster.forEach((m, i) => {
            const p = layout.positions[i];
            placements.set(m.id, { x: p.x, y: p.y, scale: layout.scale, visible: true });
        });
    }
}
