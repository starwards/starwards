import { Damage, DamageManager, SpaceManager, Spaceship, demoShip, makeShipState } from '../src';

import { MockDie } from './ship-test-harness';
import { ShipState } from '../src/ship/ship-state';
import { expect } from 'chai';

// Issue #2111: an NPC ship's systems-broken death (systemKillRatio path) must convert it to a
// Derelict, not vanish. DamageManager.update() decides *when* a ship dies (unchanged); this
// covers what it does about it.

function fragHit(): Damage {
    // Frag has surfaceEffect: true, so this counts as "damaged internals" regardless of whether
    // any system still has an unbroken surface left to take a fresh hit.
    return {
        id: 'frag-hit',
        amount: 1,
        damageSurfaceArc: [0, 1],
        damageDurationSeconds: 1,
        damageType: 'Frag',
        delivery: 'explosion',
    };
}

interface SpyCalls {
    convertToDerelict: string[];
    destroyObject: string[];
}

function fakeSpaceManager(damage: Damage | null): { spaceManager: SpaceManager; calls: SpyCalls } {
    const calls: SpyCalls = { convertToDerelict: [], destroyObject: [] };
    const spaceManager = {
        resolveObjectDamage: function* (_id: string) {
            if (damage) {
                yield damage;
            }
        },
        convertToDerelict: (id: string) => calls.convertToDerelict.push(id),
        destroyObject: (id: string) => calls.destroyObject.push(id),
    } as unknown as SpaceManager;
    return { spaceManager, calls };
}

function setUpExpendableShip(damage: Damage | null) {
    const ship = new Spaceship();
    ship.id = 'doomed-npc';
    ship.expendable = true; // NPC
    const state = makeShipState(ship.id, demoShip);
    const { spaceManager, calls } = fakeSpaceManager(damage);
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return { ship, state, damageManager, calls };
}

function breakEverySystem(damageManager: DamageManager, state: ShipState) {
    // damageAllSystems' spillover loop is capped at MAX_SPILLOVER_ROLLS per call, so one huge hit
    // isn't guaranteed to break every system (some need many small defects) -- repeat until it does.
    for (let i = 0; i < 50 && state.systems().some((s) => !s.broken); i++) {
        damageManager.damageAllSystems({ id: `setup-${i}`, amount: 999 });
    }
    const total = state.systems().length;
    const broken = state.systems().filter((s) => s.broken).length;
    // sanity: the fixture actually crosses demoShip's systemKillRatio (0.5) before the real assertions run
    expect(broken).to.be.greaterThan(total * state.design.systemKillRatio);
}

describe('DamageManager systems-broken death (issue #2111)', () => {
    it('converts the ship to a Derelict via spaceManager.convertToDerelict once the kill ratio is crossed', () => {
        const { state, damageManager, calls } = setUpExpendableShip(fragHit());
        breakEverySystem(damageManager, state);

        damageManager.update();

        expect(calls.convertToDerelict).to.deep.equal(['doomed-npc']);
        expect(calls.destroyObject).to.have.lengthOf(0);
    });

    it('does not convert when no internals were damaged this tick, even with systems already broken', () => {
        const { state, damageManager, calls } = setUpExpendableShip(null);
        breakEverySystem(damageManager, state);

        damageManager.update();

        expect(calls.convertToDerelict).to.have.lengthOf(0);
        expect(calls.destroyObject).to.have.lengthOf(0);
    });

    it('never converts a non-expendable (player) ship, even past the kill ratio', () => {
        const { ship, state, damageManager, calls } = setUpExpendableShip(fragHit());
        ship.expendable = false;
        breakEverySystem(damageManager, state);

        damageManager.update();

        expect(calls.convertToDerelict).to.have.lengthOf(0);
        expect(calls.destroyObject).to.have.lengthOf(0);
    });
});
