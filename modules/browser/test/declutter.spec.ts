import {
    DECLUTTER,
    Declutter,
    DeclutterItem,
    Rung,
    groupBadge,
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
});
