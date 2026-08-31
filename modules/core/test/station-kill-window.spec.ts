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
 * Issue #2107 (`systemKillRatio` stretch): the ~4-sim-minute kill window from the issue's ruling
 * turned out to be unreachable by this lever alone. A station's systems split 6-front/2-rear (plus
 * any chain guns, also front -- `ShipState.systemsByAreas`), and a raider pair holds one static
 * firing bearing once in range (`positionNearTarget`'s `matchGlobalSpeed` branch never repositions
 * mid-engagement), so only the systems in the arc the pair actually faces ever take damage --
 * headless measurement (see the PR body for the full sweep) showed that requiring one system more
 * than today's threshold (`systemKillRatio` >= 0.625, the next step up from 0.5's threshold) makes
 * the station permanently unkillable in a large fraction of realistic engagement bearings. Worse,
 * even *today's* threshold showed a real (~20-30%) chance of an effectively unbounded stall in the
 * same sweep, independent of this change -- a heavy-tailed defect-roll interaction pre-dating this
 * issue, out of scope here (would mean touching system `damage50` values, which the issue's
 * non-goals rule out).
 *
 * Given that, this change holds every station at its *current* broken-systems-to-kill threshold
 * (ratio 0.6, up from 0.5 -- `Math.floor(count * ratio) + 1` is a step function and both values
 * land in the same step for every station hull) rather than reaching for the requested ~0.8-0.95,
 * which would cross into the next step and introduce the stall regression above. These tests pin
 * that threshold deterministically (a broken-count formula, not a stochastic combat run) so it
 * can't regress silently in either direction.
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
        it(`${model}: one broken system short of the ratio-0.6 threshold survives, the next one kills it`, () => {
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

            breakSystem(damageManager, breakable[neededBroken - 1]);
            runDeathCheck(spaceManager, 'station', damageManager);
            expect(
                spaceManager.state.get('station')?.destroyed,
                `${model} must die at ${neededBroken}/${systems.length} broken`,
            ).to.equal(true);
        });
    }

    it('non-station hulls keep their systemKillRatio byte-identical to master (issue #2107 A2)', () => {
        expect(shipConfigurations['dragonfly-MK1'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['dragonfly-MK2'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['predator'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['glaive'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['cataphract'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['freighter'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['gravitas'].properties.systemKillRatio).to.equal(0.5);
        expect(shipConfigurations['demo-ship'].properties.systemKillRatio).to.equal(0.5);
    });

    it('the three station hulls share the new, measured-safe systemKillRatio (issue #2107)', () => {
        expect(shipConfigurations['large-station'].properties.systemKillRatio).to.equal(0.6);
        expect(shipConfigurations['chaingun-platform'].properties.systemKillRatio).to.equal(0.6);
        expect(shipConfigurations['small-station'].properties.systemKillRatio).to.equal(0.6);
    });
});
