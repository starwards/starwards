import {
    DECLUTTER,
    Declutter,
    DeclutterItem,
    Rung,
    assignSlots,
    groupBadge,
    insetRect,
    insetRegion,
    insetZoom,
    isExempt,
    nudge,
    visibleKind,
    wantedRung,
} from '../src/radar/declutter';
import { ScanLevel } from '@starwards/core';

const BLIP = 64;

function item(id: string, x: number, y: number, kind = 'Asteroid', exempt = false): DeclutterItem {
    return { id, x, y, kind, exempt };
}

/** `n` items packed `step` px apart on a row starting at (x, y). */
function row(prefix: string, n: number, x: number, y: number, step: number, kind = 'Asteroid') {
    return Array.from({ length: n }, (_, i) => item(`${prefix}${String(i).padStart(3, '0')}`, x + i * step, y, kind));
}

function settle(d: Declutter, items: DeclutterItem[], from = 0) {
    d.update(items, from);
    return d.update(items, from + DECLUTTER.holdMs);
}

describe('Dradis declutter ladder (SPEC-0007 D3)', () => {
    it('leaves non-overlapping input untouched', () => {
        const items = [item('a', 0, 0), item('b', 100, 0), item('c', 0, 100)];
        const { placements, groups } = new Declutter(BLIP).update(items, 0);
        expect(groups).toEqual([]);
        for (const i of items) expect(placements.get(i.id)).toEqual({ x: i.x, y: i.y, scale: 1, visible: true });
    });

    it('nudge separates a near pair while each icon still overlaps its true position', () => {
        const items = [item('a', 0, 0), item('b', 40, 0)];
        expect(wantedRung(items, BLIP)).toBe(Rung.NUDGE);
        const { placements, groups } = new Declutter(BLIP).update(items, 0);
        expect(groups).toEqual([]);
        const a = placements.get('a')!;
        const b = placements.get('b')!;
        expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(BLIP);
        for (const i of items) {
            const p = placements.get(i.id)!;
            expect(p.scale).toBe(1);
            expect(Math.abs(p.x - i.x)).toBeLessThanOrEqual(DECLUTTER.nudgePx);
            expect(Math.abs(p.y - i.y)).toBeLessThanOrEqual(DECLUTTER.nudgePx);
        }
    });

    it('nudge gives up when the pair is too close to separate within reach', () => {
        expect(
            nudge(
                [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
                BLIP,
                DECLUTTER.nudgePx,
            ),
        ).toBeNull();
    });

    it('shrink scales a same-type cluster, never below the floor', () => {
        const items = row('a', 3, 0, 0, 30);
        expect(wantedRung(items, BLIP)).toBe(Rung.SHRINK);
        const { placements, groups } = new Declutter(BLIP).update(items, 0);
        expect(groups).toEqual([]);
        for (const i of items) {
            const p = placements.get(i.id)!;
            expect(p.scale).toBeLessThan(1);
            expect(p.scale).toBeGreaterThanOrEqual(DECLUTTER.minScale);
            expect(p.visible).toBe(true);
        }
    });

    it('groups a cluster that the shrink floor cannot clear, at its centroid', () => {
        const items = row('a', 12, 0, 0, 2);
        const { placements, groups } = new Declutter(BLIP).update(items, 0);
        expect(groups).toHaveLength(1);
        expect(groups[0].memberIds).toHaveLength(12);
        expect(groups[0].badge).toBe('<100');
        expect(groups[0].x).toBeCloseTo(11, 5);
        for (const i of items) expect(placements.get(i.id)!.visible).toBe(false);
    });

    it.each([
        [1, '1'],
        [9, '9'],
        [10, '<100'],
        [99, '<100'],
        [100, '<1000'],
        [999, '<1000'],
        [1000, '1000+'],
    ])('badge for %i members reads %s', (n, badge) => {
        expect(groupBadge(n)).toBe(badge);
    });

    it('named, selected and own-faction objects are never candidates', () => {
        expect(isExempt({ named: true, selected: false, ownFaction: false })).toBe(true);
        expect(isExempt({ named: false, selected: true, ownFaction: false })).toBe(true);
        expect(isExempt({ named: false, selected: false, ownFaction: true })).toBe(true);
        expect(isExempt({ named: false, selected: false, ownFaction: false })).toBe(false);

        const ship = item('ship', 5, 0, 'Spaceship', true);
        const items = [...row('a', 12, 0, 0, 2), ship];
        const { placements, groups } = new Declutter(BLIP).update(items, 0);
        expect(groups[0].memberIds).not.toContain('ship');
        expect(placements.get('ship')).toEqual({ x: 5, y: 0, scale: 1, visible: true });
    });

    it('mixed scan levels never form a mixed group', () => {
        expect(visibleKind('Spaceship', ScanLevel.UFO)).toBe(visibleKind('Asteroid', ScanLevel.UFO));
        expect(visibleKind('Spaceship', ScanLevel.BASIC)).not.toBe(visibleKind('Asteroid', ScanLevel.BASIC));

        const known = row('k', 6, 0, 0, 1, visibleKind('Asteroid', ScanLevel.BASIC));
        const unknown = row('u', 6, 0, 1, 1, visibleKind('Asteroid', ScanLevel.UFO));
        const { groups } = new Declutter(BLIP).update([...known, ...unknown], 0);
        expect(groups).toHaveLength(2);
        for (const g of groups) {
            const prefixes = new Set(g.memberIds.map((id) => id[0]));
            expect(prefixes.size).toBe(1);
        }
        expect(groups.map((g) => g.badge)).toEqual(['6', '6']);
    });

    it('hysteresis holds a rung for the hold time before changing it', () => {
        const d = new Declutter(BLIP);
        const dense = row('a', 12, 0, 0, 2);
        const spread = row('a', 12, 0, 0, 100);
        expect(d.update(dense, 0).groups).toHaveLength(1);

        expect(d.update(spread, 100).groups).toHaveLength(1);
        expect(d.update(spread, 100 + DECLUTTER.holdMs - 1).groups).toHaveLength(1);
        expect(d.update(spread, 100 + DECLUTTER.holdMs).groups).toHaveLength(0);

        // flicker back and forth never completes a hold
        expect(d.update(dense, 1000).groups).toHaveLength(0);
        expect(d.update(spread, 1100).groups).toHaveLength(0);
        expect(d.update(dense, 1200).groups).toHaveLength(0);
        expect(settle(d, dense, 2000).groups).toHaveLength(1);
    });

    it('never renames or renumbers: every input id is placed exactly once', () => {
        const items = [...row('a', 12, 0, 0, 2), ...row('b', 3, 300, 0, 30), item('c', 600, 600)];
        const { placements, groups } = new Declutter(BLIP).update(items, 0);
        expect([...placements.keys()].sort()).toEqual(items.map((i) => i.id).sort());
        expect(groups.flatMap((g) => g.memberIds).every((id) => items.some((i) => i.id === id))).toBe(true);
    });

    it('a group that splits into separate dense clusters becomes separate groups at once', () => {
        const d = new Declutter(BLIP);
        expect(d.update([...row('a', 12, 0, 0, 2), ...row('b', 12, 30, 0, 2)], 0).groups).toHaveLength(1);
        expect(d.update([...row('a', 12, 0, 0, 2), ...row('b', 12, 300, 0, 2)], 10).groups).toHaveLength(2);
    });
});

describe('Dradis declutter rung 4: POI + inset (SPEC-0007 D4)', () => {
    const VIEW = { width: 800, height: 600 };

    it('forms a POI only when group boxes still overlap after rung 3', () => {
        const known = row('k', 12, 100, 100, 2, 'Asteroid');
        const unknown = row('u', 12, 120, 110, 2, 'unknown');
        const { groups, pois } = new Declutter(BLIP, true).update([...known, ...unknown], 0, VIEW);
        expect(groups).toEqual([]);
        expect(pois).toHaveLength(1);
        expect(pois[0].memberIds).toHaveLength(24);
        expect(pois[0].badge).toBe('<100');
    });

    it('same-kind fields merge into one group, not a POI', () => {
        const items = [...row('a', 12, 100, 100, 2), ...row('b', 12, 120, 110, 2)];
        const { groups, pois } = new Declutter(BLIP, true).update(items, 0, VIEW);
        expect(groups).toHaveLength(1);
        expect(pois).toEqual([]);
    });

    it('overlapping full-size icons of different kinds are not a super-cluster', () => {
        const items = [item('a', 100, 100, 'Asteroid'), item('b', 110, 100, 'unknown')];
        expect(new Declutter(BLIP, true).update(items, 0, VIEW).pois).toEqual([]);
    });

    it('groups that overlap by 25% or less stay groups', () => {
        // 64px boxes 48px apart on one axis overlap by exactly 25%
        const items = [...row('k', 12, 100, 100, 1, 'Asteroid'), ...row('u', 12, 148, 100, 1, 'unknown')];
        const { groups, pois } = new Declutter(BLIP, true).update(items, 0, VIEW);
        expect(pois).toEqual([]);
        expect(groups).toHaveLength(2);
    });

    it('rung 4 is off unless enabled (insets never recurse)', () => {
        const items = [...row('k', 12, 100, 100, 2, 'Asteroid'), ...row('u', 12, 120, 110, 2, 'unknown')];
        expect(new Declutter(BLIP).update(items, 0, VIEW).pois).toEqual([]);
    });

    it('the inset region is the padded bounding box of world positions, and the inset zoom fits it', () => {
        const region = insetRegion([
            { x: 0, y: 0 },
            { x: 1000, y: 500 },
        ]);
        expect(region).toEqual({ minX: -100, minY: -50, maxX: 1100, maxY: 550 });
        expect(insetZoom(region, 240)).toBeCloseTo(240 / 1200, 9);

        const known = row('k', 12, 100, 100, 2, 'Asteroid').map((i, n) => ({ ...i, world: { x: n * 10, y: 0 } }));
        const unknown = row('u', 12, 120, 110, 2, 'unknown').map((i, n) => ({ ...i, world: { x: n * 10, y: 50 } }));
        const [poi] = new Declutter(BLIP, true).update([...known, ...unknown], 0, VIEW).pois;
        expect(poi.region).toEqual(insetRegion([...known, ...unknown].map((i) => i.world)));
    });

    it('inset panels sit on the left edge, sized 30% of the shorter side within 160-320px', () => {
        expect(insetRect({ width: 800, height: 600 }, 0)).toEqual({ x: 16, y: 16, side: 180 });
        expect(insetRect({ width: 800, height: 600 }, 1)).toEqual({ x: 16, y: 212, side: 180 });
        expect(insetRect({ width: 300, height: 300 }, 0).side).toBe(160);
        expect(insetRect({ width: 2000, height: 2000 }, 0).side).toBe(320);
        expect(insetRect({ width: 800, height: 600 }, 0, 240).x).toBe(256);
    });

    it('slot assignment caps at maxInsets by member count and stays stable across frames', () => {
        const first = assignSlots(
            [
                { key: 'a', count: 5, eligible: true },
                { key: 'b', count: 30, eligible: true },
                { key: 'c', count: 12, eligible: true },
            ],
            new Map(),
        );
        expect(DECLUTTER.maxInsets).toBe(2);
        expect([...first.entries()].sort()).toEqual([
            ['b', 0],
            ['c', 1],
        ]);
        // 'a' grows past both, but slots do not swap while their POIs persist
        const second = assignSlots(
            [
                { key: 'a', count: 99, eligible: true },
                { key: 'b', count: 30, eligible: true },
                { key: 'c', count: 12, eligible: true },
            ],
            first,
        );
        expect(second).toEqual(first);
        // 'b' leaves the screen: its slot frees up for 'a'
        const third = assignSlots(
            [
                { key: 'a', count: 99, eligible: true },
                { key: 'b', count: 30, eligible: false },
                { key: 'c', count: 12, eligible: true },
            ],
            second,
        );
        expect([...third.entries()].sort()).toEqual([
            ['a', 0],
            ['c', 1],
        ]);
    });

    it('three super-clusters give three POIs and two insets, for the two largest', () => {
        const pair = (p: string, x: number, n: number) => [
            ...row(`${p}k`, n, x, 100, 1, 'Asteroid'),
            ...row(`${p}u`, n, x + 10, 110, 1, 'unknown'),
        ];
        const items = [...pair('a', 100, 10), ...pair('b', 300, 30), ...pair('c', 500, 20)];
        const { pois } = new Declutter(BLIP, true).update(items, 0, VIEW);
        expect(pois).toHaveLength(3);
        const bySlot = pois.filter((p) => p.slot !== null).sort((x, y) => x.slot! - y.slot!);
        expect(bySlot.map((p) => p.key[0])).toEqual(['b', 'c']);
    });

    it('a POI off the canvas gets no inset', () => {
        const items = [...row('k', 12, -300, 100, 2, 'Asteroid'), ...row('u', 12, -280, 110, 2, 'unknown')];
        const { pois } = new Declutter(BLIP, true).update(items, 0, VIEW);
        expect(pois).toHaveLength(1);
        expect(pois[0].slot).toBeNull();
    });

    it('a POI holds for the hold time after its overlap clears', () => {
        const d = new Declutter(BLIP, true);
        const close = [...row('k', 12, 100, 100, 2, 'Asteroid'), ...row('u', 12, 120, 110, 2, 'unknown')];
        const apart = [...row('k', 12, 100, 100, 2, 'Asteroid'), ...row('u', 12, 400, 110, 2, 'unknown')];
        expect(d.update(close, 0, VIEW).pois).toHaveLength(1);
        expect(d.update(apart, 100, VIEW).pois).toHaveLength(1);
        const after = d.update(apart, 100 + DECLUTTER.holdMs, VIEW);
        expect(after.pois).toEqual([]);
        expect(after.groups).toHaveLength(2);
    });

    it('a POI that splits into separate super-clusters becomes separate POIs at once', () => {
        const d = new Declutter(BLIP, true);
        const pair = (p: string, x: number) => [
            ...row(`${p}k`, 12, x, 100, 1, `${p}-Asteroid`),
            ...row(`${p}u`, 12, x + 10, 110, 1, `${p}-unknown`),
        ];
        expect(d.update([...pair('a', 100), ...pair('b', 120)], 0, VIEW).pois).toHaveLength(1);
        expect(d.update([...pair('a', 100), ...pair('b', 400)], 10, VIEW).pois).toHaveLength(2);
    });
});
