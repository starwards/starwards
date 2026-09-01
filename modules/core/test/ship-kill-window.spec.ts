import {
    Damage,
    DamageManager,
    Faction,
    ShipArea,
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
 * Issue #2192: a Corvette (gravitas) needed ~5 GM energy refills plus GM-forced damage to kill a
 * single fighter, while stations in the same session died in roughly the expected time. Root
 * cause: weapon fire only ever reaches the systems in the firer's currently-faced arc
 * (`ShipState.systemsByAreas`, front vs rear), but `DamageManager.update()`'s kill check counts
 * broken systems across the *whole* ship (both arcs) against `systemKillRatio`. Issue #2107 tuned
 * this same lever for stations and left every other hull's ratio untouched -- but for several
 * non-station hulls the resulting broken-systems threshold equals or exceeds the system count of
 * their *larger* arc, so a sustained attack that never re-flanks (`dragonfly-MK2`) can require
 * literally 100% of one arc broken, or (`dragonfly-MK2` specifically) is mathematically
 * unreachable via any single arc at all.
 *
 * Stations already carry a 1-system margin between their kill threshold and their largest arc
 * (`station-kill-window.spec.ts`); this holds every hull to that same margin.
 */
function frontAndRear(model: keyof typeof shipConfigurations) {
    const state = makeShipState('probe', shipConfigurations[model]);
    const front = state.systemsByAreas(ShipArea.front).length;
    const rear = state.systemsByAreas(ShipArea.rear).length;
    return { front, rear, total: front + rear };
}

function neededBroken(model: keyof typeof shipConfigurations) {
    const { total } = frontAndRear(model);
    const ratio = shipConfigurations[model].properties.systemKillRatio;
    return Math.floor(total * ratio) + 1;
}

const NON_STATION_HULLS = [
    'demo-ship',
    'dragonfly-MK1',
    'dragonfly-MK2',
    'gravitas',
    'predator',
    'glaive',
    'cataphract',
    'freighter',
] as const;

function setUpShip(model: keyof typeof shipConfigurations) {
    const ship = new Spaceship().init('probe', new Vec2(0, 0), model, Faction.Gravitas);
    const state = makeShipState(ship.id, shipConfigurations[model]);
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    spaceManager.forceFlushEntities();
    const die = new MockDie();
    die.expectedRoll = 0; // every eligible defect roll succeeds -- fastest possible break
    const damageManager = new DamageManager(ship, state, spaceManager, die);
    return { ship, state, spaceManager, damageManager };
}

/** Same helper as station-kill-window.spec.ts: forces one system broken via the production spillover-roll path. */
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

/** Same helper as station-kill-window.spec.ts: runs the exact death check DamageManager.update() runs in production. */
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
    // @ts-ignore : access private field, same as station-kill-window.spec.ts
    spaceManager.objectDamage.set(shipId, [trigger]);
    damageManager.update();
}

describe('ship kill window (issue #2192)', () => {
    for (const model of NON_STATION_HULLS) {
        it(`${model}: kill threshold leaves slack within its larger arc, so a sustained single-bearing attack can still kill it`, () => {
            const { front, rear } = frontAndRear(model);
            const largerArc = Math.max(front, rear);
            expect(
                neededBroken(model),
                `${model}: needs ${neededBroken(model)} broken systems but its larger arc (front=${front}, rear=${rear}) only has ${largerArc} -- a static firing bearing can never reach the threshold with any margin for missed hits`,
            ).to.be.at.most(largerArc - 1);
        });
    }

    for (const model of ['dragonfly-MK1', 'gravitas'] as const) {
        it(`${model}: dies once its larger arc is broken down to the threshold, without ever touching the other arc`, () => {
            const { front, rear } = frontAndRear(model);
            const largerArea = front >= rear ? ShipArea.front : ShipArea.rear;
            const { state, spaceManager, damageManager } = setUpShip(model);
            const systems = state.systemsByAreas(largerArea);
            const needed = neededBroken(model);
            expect(systems.length, `${model}: not enough systems in the larger arc for this threshold`).to.be.at.least(
                needed,
            );

            const breakable = systems.filter((s) => s.name !== 'Magazine');
            expect(breakable.length, `${model}: not enough breakable systems in the larger arc`).to.be.at.least(needed);

            for (const system of breakable.slice(0, needed - 1)) {
                breakSystem(damageManager, system);
            }
            runDeathCheck(spaceManager, 'probe', damageManager);
            expect(
                spaceManager.state.get('probe')?.destroyed,
                `${model} must survive at ${needed - 1}/${needed} of its larger arc broken`,
            ).to.equal(false);

            breakSystem(damageManager, breakable[needed - 1]);
            runDeathCheck(spaceManager, 'probe', damageManager);
            expect(
                spaceManager.state.get('probe')?.destroyed,
                `${model} must die once ${needed}/${needed} of its larger arc is broken`,
            ).to.equal(true);
        });
    }
});
