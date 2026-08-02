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
    test('glaive: two chain guns traverse exactly ±90 about fittedBearing 90 and -90', () => {
        const state = makeShipState('1', shipConfigurations.glaive);

        expect(state.chainGuns[0].fittedBearing).toBe(90);
        expect(state.chainGuns[0].design.bearingLimit).toBe(90);
        expect(state.chainGuns[1].fittedBearing).toBe(-90);
        expect(state.chainGuns[1].design.bearingLimit).toBe(90);
    });

    test('cataphract: main guns ±135 and chin gun ±30, all about fittedBearing 0', () => {
        const state = makeShipState('1', shipConfigurations.cataphract);

        expect(state.chainGuns[0].fittedBearing).toBe(0);
        expect(state.chainGuns[0].design.bearingLimit).toBe(135);
        expect(state.chainGuns[1].fittedBearing).toBe(0);
        expect(state.chainGuns[1].design.bearingLimit).toBe(135);
        expect(state.chainGuns[2].fittedBearing).toBe(0);
        expect(state.chainGuns[2].design.bearingLimit).toBe(30);
    });
});
