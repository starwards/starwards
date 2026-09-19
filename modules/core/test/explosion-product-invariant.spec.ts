import { ProjectileDesign, WarheadDesign, ammoDesigns } from '../src';

/**
 * `damageFootprint` sizes a detonation's reach off `secondsToLive * expansionSpeed`
 * (see space-manager.ts). Shortening a blast's lifetime while raising its expansion speed
 * by the same factor must leave that product -- and so the warhead's reach -- unchanged
 * (issue #2252). This pins the invariant so a later edit to one field without the other
 * fails CI instead of silently changing a warhead's range.
 */
function* explosionBlocks(): Generator<[string, WarheadDesign & { delivery: 'explosion' }]> {
    for (const [name, design] of Object.entries(ammoDesigns) as [string, ProjectileDesign][]) {
        if (design.delivery === 'explosion') {
            yield [name, design];
        }
        if (design.warheads) {
            for (const [mode, warhead] of Object.entries(design.warheads)) {
                if (warhead.delivery === 'explosion') {
                    yield [`${name}.${mode}`, warhead];
                }
            }
        }
    }
}

describe('explosion secondsToLive * expansionSpeed product invariant (issue #2252)', () => {
    const expectedProducts: Record<string, number> = {
        HiExpShell: 200,
        FragShell: 250,
        HiExpMissile: 350,
        FragMissile: 800,
        ClusterMissile: 750,
        'ClusterMissile.Frag': 750,
    };

    for (const [name, warhead] of explosionBlocks()) {
        it(`${name}: secondsToLive * expansionSpeed stays at its designed reach`, () => {
            const expected = expectedProducts[name];
            expect(expected).toBeDefined();
            const product = warhead.explosion.secondsToLive * warhead.explosion.expansionSpeed;
            expect(product).toBeCloseTo(expected, 5);
        });
    }
});
