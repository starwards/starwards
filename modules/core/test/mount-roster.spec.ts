import { ShipDesign, makeShipState, shipConfigurations } from '../src';

type MountDesign = { turnSpeed?: number; bearingLimit?: number; maxBearingSkew?: number };

function allMounts(design: ShipDesign): Array<{ label: string; mount: MountDesign }> {
    const mounts: Array<{ label: string; mount: MountDesign }> = [];
    design.chainGuns.forEach(([, mount], i) => mounts.push({ label: `chainGuns[${i}]`, mount }));
    design.tubes.forEach(([, mount], i) => mounts.push({ label: `tubes[${i}]`, mount }));
    design.thrusters.forEach(([, mount], i) => mounts.push({ label: `thrusters[${i}]`, mount }));
    design.radars.forEach((mount, i) => mounts.push({ label: `radars[${i}]`, mount }));
    return mounts;
}

describe('mount roster states bearingLimit and maxBearingSkew explicitly (issue #2051, A16)', () => {
    test.each(Object.keys(shipConfigurations))('%s: no mount relies on the schema default', (key) => {
        const design = shipConfigurations[key as keyof typeof shipConfigurations] as ShipDesign;
        const missing = allMounts(design)
            .filter(({ mount }) => !('bearingLimit' in mount) || !('maxBearingSkew' in mount))
            .map(({ label }) => label);
        expect(missing).toEqual([]);
    });
});

describe('the ± flip cannot silently halve a firing arc (issue #2051, A11)', () => {
    test('glaive: two chain guns traverse exactly ±30 about fittedBearing 90 and -90', () => {
        const state = makeShipState('1', shipConfigurations.glaive);

        expect(state.chainGuns[0].fittedBearing).toBe(90);
        expect(state.chainGuns[0].design.bearingLimit).toBe(30);
        expect(state.chainGuns[1].fittedBearing).toBe(-90);
        expect(state.chainGuns[1].design.bearingLimit).toBe(30);
    });

    test('cataphract: all three guns ±30, all about fittedBearing 0', () => {
        const state = makeShipState('1', shipConfigurations.cataphract);

        expect(state.chainGuns[0].fittedBearing).toBe(0);
        expect(state.chainGuns[0].design.bearingLimit).toBe(30);
        expect(state.chainGuns[1].fittedBearing).toBe(0);
        expect(state.chainGuns[1].design.bearingLimit).toBe(30);
        expect(state.chainGuns[2].fittedBearing).toBe(0);
        expect(state.chainGuns[2].design.bearingLimit).toBe(30);
    });
});

describe('chaingun platform mounts (M4.21)', () => {
    test('four ±90 mounts at the cardinal bearings cover every bearing at least twice, from the hull edge', () => {
        const state = makeShipState('1', shipConfigurations['chaingun-platform']);

        expect(state.chainGuns.map((g) => g.fittedBearing).sort((a, b) => a - b)).toEqual([-90, 0, 90, 180]);
        for (const gun of state.chainGuns) {
            expect(gun.design.bearingLimit).toBe(90);
            expect(gun.design.mountRadiusFraction).toBe(1);
        }
        for (let bearing = -180; bearing < 180; bearing += 5) {
            const covering = state.chainGuns.filter(
                (g) => Math.abs(((((bearing - g.fittedBearing) % 360) + 540) % 360) - 180) <= g.design.bearingLimit,
            );
            expect(covering.length).toBeGreaterThanOrEqual(2);
        }
    });

    test('a mount with mountRadiusFraction fires from its fitted point, not along the aim', () => {
        const state = makeShipState('1', shipConfigurations['chaingun-platform']);
        jest.spyOn(state, 'radius', 'get').mockReturnValue(shipConfigurations['chaingun-platform'].radius);
        const port = state.chainGuns.find((g) => g.fittedBearing === 90);
        const muzzle = port?.getMuzzlePosition(state);
        expect(muzzle?.x).toBeCloseTo(0, 3);
        expect(muzzle?.y).toBeCloseTo(shipConfigurations['chaingun-platform'].radius, 3);
    });
});
