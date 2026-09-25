import {
    Damage,
    DamageManager,
    Faction,
    SpaceManager,
    Spaceship,
    Vec2,
    makeShipState,
    shipConfigurations,
} from '../src';

import { MockDie } from './ship-test-harness';
import { ShipSystem } from '../src/ship/ship-manager-abstract';
import { expect } from 'chai';

/**
 * A station's mission-kill threshold (`healthRatio` 0) sits one system below its larger arc. Its
 * systems split 6 front / 2 rear (plus front chain guns, `ShipState.systemsByAreas`), and raiders
 * hold one firing bearing once in range, so only the faced arc takes damage; a threshold at or
 * above that arc's size would make the mission kill unreachable from most bearings
 * ([#2107](https://github.com/starwards/starwards/issues/2107)). `Math.floor(count * ratio) + 1` is
 * a step function, so these tests pin the broken-system count deterministically rather than
 * through a stochastic combat run.
 *
 * Death is a separate threshold: only a breached `Capsule` kills (`damage-manager-death.spec.ts`).
 * How long it takes is pinned by the fighter half-life spec
 * (`modules/server/src/test/training/fighter-half-life.ts`), not here.
 */
function setUpStation(model: 'large-station' | 'chaingun-platform' | 'small-station') {
    const ship = new Spaceship().init('station', new Vec2(0, 0), model, Faction.Gravitas);
    const state = makeShipState(ship.id, shipConfigurations[model]);
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    spaceManager.forceFlushEntities();
    const die = new MockDie();
    die.expectedRoll = 0; // every eligible defect roll succeeds -- fastest possible break
    const damageManager = new DamageManager(ship, state, spaceManager, die);
    return { ship, state, spaceManager, damageManager };
}

/**
 * Forces one system broken via the same spillover-roll path production damage takes. A single
 * `damageSystem` call is capped at `MAX_SPILLOVER_ROLLS` (20) defects regardless of amount, and
 * some systems need many more than 20 defects to cross their break threshold (e.g. smart pilot:
 * `offsetBrokenThreshold` 0.6 at +0.01/defect = 60), so this calls it repeatedly with a fresh event
 * id each time until the system actually breaks.
 */
function breakSystem(damageManager: DamageManager, system: ShipSystem) {
    for (let i = 0; i < 200 && !system.broken; i++) {
        damageManager.damageSystem(
            system,
            { id: `force-break-${system.name}-${i}`, amount: 1000 * system.design.damage50 },
            1,
        );
    }
    expect(system.broken, `expected ${system.name} to be broken`).to.equal(true);
}

/**
 * Runs the exact death check `DamageManager.update()` runs in production -- a zero-amount `HiExp`
 * surface-effect hit so `damagedInternals` goes true (surfaceEffect is a profile-level flag,
 * independent of the hit amount) without perturbing any system's break state.
 */
function runDeathCheck(spaceManager: SpaceManager, shipId: string, damageManager: DamageManager) {
    const trigger: Damage = {
        id: 'trigger',
        shipId: '',
        amount: 0,
        damageSurfaceArc: [0, 1],
        damageDurationSeconds: 0.05,
        damageType: 'HiExp',
        delivery: 'explosion',
    };
    // production only exposes this queue internally (populated by collision resolution); tests
    // reach in the same way `driver.ts` reaches into GameManager's private fields
    // @ts-ignore : access private field
    spaceManager.objectDamage.set(shipId, [trigger]);
    damageManager.update();
}

describe('station kill window (issue #2107)', () => {
    for (const model of ['large-station', 'chaingun-platform', 'small-station'] as const) {
        it(`${model}: one broken system short of the ratio-0.6 threshold is not mission-killed, the next one is, and a mission kill alone never kills it`, () => {
            const { state, spaceManager, damageManager } = setUpStation(model);
            const systems = state.systems();
            const ratio = shipConfigurations[model].properties.systemKillRatio;
            const neededBroken = Math.floor(systems.length * ratio) + 1;
            expect(neededBroken, `${model}: needed-broken count regressed`).to.be.within(2, systems.length);

            // an unarmed station's magazine has every ammo count already at 0, so MockDie's
            // fixed roll=0 -- which always selects damageMagazine's setCount branch -- can never
            // move it toward broken; this test only needs *some* threshold-worth of systems to
            // break, so skip the one system type MockDie can't reliably break here.
            const breakable = systems.filter((s) => s.name !== 'Magazine');
            expect(breakable.length, `${model}: not enough breakable systems for this threshold`).to.be.at.least(
                neededBroken,
            );

            for (const system of breakable.slice(0, neededBroken - 1)) {
                breakSystem(damageManager, system);
            }
            runDeathCheck(spaceManager, 'station', damageManager);
            expect(
                spaceManager.state.get('station')?.destroyed,
                `${model} must survive at ${neededBroken - 1}/${systems.length} broken`,
            ).to.equal(false);

            expect(state.healthRatio, `${model} is not mission-killed one system short`).to.be.greaterThan(0);

            breakSystem(damageManager, breakable[neededBroken - 1]);
            runDeathCheck(spaceManager, 'station', damageManager);
            expect(state.healthRatio, `${model} is mission-killed at ${neededBroken}/${systems.length}`).to.equal(0);
            expect(spaceManager.state.get('station')?.destroyed, `${model} must survive a mission kill`).to.equal(
                false,
            );
        });
    }

    it('non-station hulls hold their mission-kill systemKillRatio (#2107, #2192)', () => {
        // each keeps a one-system margin within its larger arc -- see ship-kill-window.spec.ts
        expect(shipConfigurations['dragonfly-MK1'].properties.systemKillRatio).to.equal(0.45);
        expect(shipConfigurations['dragonfly-MK2'].properties.systemKillRatio).to.equal(0.4);
        expect(shipConfigurations['predator'].properties.systemKillRatio).to.equal(0.45);
        expect(shipConfigurations['glaive'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['cataphract'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['freighter'].properties.systemKillRatio).to.equal(0.45);
        expect(shipConfigurations['gravitas'].properties.systemKillRatio).to.equal(0.45);
        expect(shipConfigurations['demo-ship'].properties.systemKillRatio).to.equal(0.45);
    });

    it('the three station hulls share one mission-kill systemKillRatio (#2107)', () => {
        expect(shipConfigurations['large-station'].properties.systemKillRatio).to.equal(0.6);
        expect(shipConfigurations['chaingun-platform'].properties.systemKillRatio).to.equal(0.6);
        expect(shipConfigurations['small-station'].properties.systemKillRatio).to.equal(0.6);
    });
});
