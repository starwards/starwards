import { ScanLevel } from '@starwards/core';

/** Tuning for the Dradis declutter ladder (SPEC-0007 D3, D4). Approved defaults, to be tuned at playtest. */
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
    /** Rung 4: rendered boxes overlapping by more than this fraction of the smaller box form a super-cluster. */
    poiOverlap: 0.25,
    /** Inset side, as a fraction of the canvas's shorter dimension, clamped to `insetMinPx`..`insetMaxPx`. */
    insetFraction: 0.3,
    insetMinPx: 160,
    insetMaxPx: 320,
    /** Gap between an inset and the canvas's left/top edge, and between stacked insets, in px. */
    insetMarginPx: 16,
    /** At most this many POIs get an inset; the rest show the marker only. */
    maxInsets: 2,
    /** Padding added on each side of an inset's region, as a fraction of the region's size. */
    insetPadding: 0.1,
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
    /** True world position, used for an inset's region. Defaults to the screen position. */
    world?: Point;
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

/** World-space axis-aligned rectangle. */
export type Region = { minX: number; minY: number; maxX: number; maxY: number };

/** Rung 4: a super-cluster collapsed to one point of interest (SPEC-0007 D4). */
export type Poi = {
    /** Stable for as long as the POI keeps its lowest-sorted member. */
    key: string;
    x: number;
    y: number;
    memberIds: string[];
    badge: string;
    /** Padded bounding box of the members' world positions. */
    region: Region;
    /** Inset slot (0 = top), or null when this POI shows its marker only. */
    slot: number | null;
};

export type DeclutterResult = {
    placements: Map<string, Placement>;
    groups: Group[];
    pois: Poi[];
};

export type Viewport = { width: number; height: number };

/** Screen-space box centred on (x, y), standing for the given items. */
type Box = { x: number; y: number; size: number; ids: string[] };

/** Intersection area as a fraction of the smaller box's area. */
function overlapFraction(a: Box, b: Box): number {
    const w = Math.min(a.x + a.size / 2, b.x + b.size / 2) - Math.max(a.x - a.size / 2, b.x - b.size / 2);
    const h = Math.min(a.y + a.size / 2, b.y + b.size / 2) - Math.max(a.y - a.size / 2, b.y - b.size / 2);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / Math.min(a.size * a.size, b.size * b.size);
}

/** Connected sets of two or more boxes overlapping by more than `DECLUTTER.poiOverlap`. */
function findSuperClusters(boxes: Box[]): Box[][] {
    const seen = new Set<Box>();
    const result: Box[][] = [];
    for (const start of boxes) {
        if (seen.has(start)) continue;
        seen.add(start);
        const set = [start];
        for (let i = 0; i < set.length; i++) {
            for (const other of boxes) {
                if (!seen.has(other) && overlapFraction(set[i], other) > DECLUTTER.poiOverlap) {
                    seen.add(other);
                    set.push(other);
                }
            }
        }
        if (set.length >= 2) result.push(set);
    }
    return result;
}

/** Bounding box of `points`, padded by `DECLUTTER.insetPadding` of its size on each side. */
export function insetRegion(points: Point[]): Region {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const padX = (maxX - minX) * DECLUTTER.insetPadding;
    const padY = (maxY - minY) * DECLUTTER.insetPadding;
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
}

/** The largest zoom (px per metre) at which `region` fits a square panel of `side` px. */
export function insetZoom(region: Region, side: number): number {
    const extent = Math.max(region.maxX - region.minX, region.maxY - region.minY);
    return extent > 0 ? side / extent : Infinity;
}

/** Screen rectangle of inset `slot`, stacked top-down from the canvas's left edge (moved right by `offsetX`). */
export function insetRect(view: Viewport, slot: number, offsetX = 0) {
    const side = Math.max(
        DECLUTTER.insetMinPx,
        Math.min(DECLUTTER.insetMaxPx, DECLUTTER.insetFraction * Math.min(view.width, view.height)),
    );
    const x = offsetX + DECLUTTER.insetMarginPx;
    const y = DECLUTTER.insetMarginPx + slot * (side + DECLUTTER.insetMarginPx);
    return { x, y, side };
}

/**
 * Inset slots for this frame: a POI that had a slot keeps it while it persists; free slots go to the
 * eligible POIs with the most members, up to `DECLUTTER.maxInsets`.
 */
export function assignSlots(
    pois: { key: string; count: number; eligible: boolean }[],
    previous: ReadonlyMap<string, number>,
): Map<string, number> {
    const slots = new Map<string, number>();
    for (const poi of pois) {
        const slot = previous.get(poi.key);
        if (poi.eligible && slot !== undefined && slot < DECLUTTER.maxInsets) slots.set(poi.key, slot);
    }
    const waiting = pois
        .filter((p) => p.eligible && !slots.has(p.key))
        .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
    for (let slot = 0; slot < DECLUTTER.maxInsets && waiting.length; slot++) {
        if (![...slots.values()].includes(slot)) slots.set(waiting.shift()!.key, slot);
    }
    return slots;
}

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
function findClusters(
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

type Held<T = Rung> = { shown: T; pending: T; since: number };

/** Hysteresis: `shown` follows `wanted` only after `wanted` held steady for `DECLUTTER.holdMs`. */
function hold<T>(prev: Held<T> | undefined, wanted: T, now: number): Held<T> {
    if (!prev) return { shown: wanted, pending: wanted, since: now };
    if (wanted === prev.shown) return { shown: wanted, pending: wanted, since: now };
    if (wanted !== prev.pending) return { shown: prev.shown, pending: wanted, since: now };
    if (now - prev.since >= DECLUTTER.holdMs) return { shown: wanted, pending: wanted, since: now };
    return prev;
}

/**
 * The declutter ladder (SPEC-0007 D3, D4), run once per frame on screen positions. Stateful only for
 * hysteresis: a member's rung changes after the wanted rung held for `DECLUTTER.holdMs`; a cluster
 * shows the highest rung any member holds. Rung 4 (POI) runs only when `withPoi` is set, so it
 * never recurses into an inset.
 */
export class Declutter {
    private held = new Map<string, Held>();
    /** Group key of each member of a group drawn last frame, so a held group outlives its overlap. */
    private groupOf = new Map<string, string>();
    private poiHeld = new Map<string, Held<boolean>>();
    /** POI key of each member of a POI drawn last frame, so a held POI outlives its overlap. */
    private poiOf = new Map<string, string>();
    private slots = new Map<string, number>();

    constructor(
        private readonly blipSize: number,
        private readonly withPoi = false,
    ) {}

    /** `view` is the canvas size; a POI off it gets no inset. */
    update(items: DeclutterItem[], now: number, view?: Viewport): DeclutterResult {
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
                const h = hold(this.held.get(member.id), wanted, now);
                nextHeld.set(member.id, h);
                shown = Math.max(shown, h.shown);
            }
            this.apply(cluster, shown, placements, groups);
        }
        this.held = nextHeld;
        this.groupOf = new Map(groups.flatMap((g) => g.memberIds.map((id) => [id, g.key] as const)));
        if (!this.withPoi) return { placements, groups, pois: [] };
        const pois = this.collapse(items, placements, groups, now, view);
        return { placements, groups: groups.filter((g) => !g.memberIds.some((id) => this.poiOf.has(id))), pois };
    }

    /** Rung 4: what still overlaps after rungs 1-3 collapses into POIs, hiding their members. */
    private collapse(
        items: DeclutterItem[],
        placements: Map<string, Placement>,
        groups: Group[],
        now: number,
        view?: Viewport,
    ): Poi[] {
        const byId = new Map(items.map((i) => [i.id, i]));
        const boxes: Box[] = groups.map((g) => ({ x: g.x, y: g.y, size: this.blipSize, ids: g.memberIds }));
        for (const item of items) {
            const p = placements.get(item.id)!;
            if (!item.exempt && p.visible && p.scale < 1) {
                boxes.push({ x: p.x, y: p.y, size: this.blipSize * p.scale, ids: [item.id] });
            }
        }
        const superOf = new Map<string, number>();
        findSuperClusters(boxes).forEach((set, index) => {
            for (const box of set) for (const id of box.ids) superOf.set(id, index);
        });

        const nextHeld = new Map<string, Held<boolean>>();
        const shown: string[] = [];
        for (const item of items) {
            if (item.exempt) continue;
            const h = hold(this.poiHeld.get(item.id), superOf.has(item.id), now);
            nextHeld.set(item.id, h);
            if (h.shown) shown.push(item.id);
        }
        this.poiHeld = nextHeld;

        // members stay together while they share a current super-cluster, a held POI, or a group
        const parent = new Map(shown.map((id) => [id, id]));
        const find = (id: string): string => {
            const p = parent.get(id)!;
            if (p === id) return id;
            const root = find(p);
            parent.set(id, root);
            return root;
        };
        const join = (a: string, b: string) => parent.set(find(a), find(b));
        const firstWithTag = new Map<string, string>();
        const tag = (id: string, t: string | undefined) => {
            if (t === undefined) return;
            const first = firstWithTag.get(t);
            if (first === undefined) firstWithTag.set(t, id);
            else join(first, id);
        };
        for (const id of shown) {
            const s = superOf.get(id);
            tag(id, s === undefined ? undefined : `super:${s}`);
            // only a member held past its overlap keeps last frame's POI; the rest follow this frame's
            const p = s === undefined ? this.poiOf.get(id) : undefined;
            tag(id, p === undefined ? undefined : `poi:${p}`);
            const g = this.groupOf.get(id);
            tag(id, g === undefined ? undefined : `group:${g}`);
        }
        const components = new Map<string, string[]>();
        for (const id of shown) {
            const root = find(id);
            components.set(root, [...(components.get(root) ?? []), id]);
        }

        const raw = [...components.values()]
            .filter((ids) => ids.length >= 2)
            .map((ids) => {
                ids.sort();
                const members = ids.map((id) => byId.get(id)!);
                const x = members.reduce((sum, m) => sum + m.x, 0) / members.length;
                const y = members.reduce((sum, m) => sum + m.y, 0) / members.length;
                const eligible = !view || (x >= 0 && y >= 0 && x <= view.width && y <= view.height);
                return { key: ids[0], ids, x, y, eligible, members };
            });
        this.slots = assignSlots(
            raw.map((p) => ({ key: p.key, count: p.ids.length, eligible: p.eligible })),
            this.slots,
        );
        this.poiOf = new Map(raw.flatMap((p) => p.ids.map((id) => [id, p.key] as const)));
        return raw.map((p) => {
            for (const id of p.ids) {
                placements.set(id, { ...placements.get(id)!, visible: false });
            }
            return {
                key: p.key,
                x: p.x,
                y: p.y,
                memberIds: p.ids,
                badge: groupBadge(p.ids.length),
                region: insetRegion(p.members.map((m) => m.world ?? m)),
                slot: this.slots.get(p.key) ?? null,
            };
        });
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
