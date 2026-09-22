import { CAPSULE_DEFECT_STEP, Damage, DamageManager, SpaceManager, Spaceship, demoShip, makeShipState } from '../src';

import { MockDie } from './ship-test-harness';
import { ShipState } from '../src/ship/ship-state';
import { damageProfiles } from '../src/space/damage-profile';
import { expect } from 'chai';

// An expendable ship dies -- converts to a Derelict -- only when its capsule, the internal hull
// core, is breached. Broken systems alone (`systemKillRatio`, `healthRatio`) are a mission kill.

function hit(damageType: 'Frag' | 'HiExp', damageSurfaceArc: [number, number] = [0, 1], id = 'hit'): Damage {
    return {
        id,
        amount: 1_000,
        damageSurfaceArc,
        damageDurationSeconds: 1,
        damageType,
        delivery: 'explosion',
        shipId: 'shooter-npc',
    };
}

interface SpyCalls {
    convertToDerelict: string[];
    destroyObject: string[];
}

function fakeSpaceManager(damages: Damage[]): { spaceManager: SpaceManager; calls: SpyCalls } {
    const calls: SpyCalls = { convertToDerelict: [], destroyObject: [] };
    const spaceManager = {
        resolveObjectDamage: function* (_id: string) {
            yield* damages.splice(0);
        },
        convertToDerelict: (id: string) => calls.convertToDerelict.push(id),
        destroyObject: (id: string) => calls.destroyObject.push(id),
        registerHit: () => {
            /* not under test here */
        },
        markBreachHit: () => {
            /* not under test here */
        },
    } as unknown as SpaceManager;
    return { spaceManager, calls };
}

function setUpExpendableShip(damages: Damage[] = []) {
    const ship = new Spaceship();
    ship.id = 'doomed-npc';
    ship.expendable = true; // NPC
    const state = makeShipState(ship.id, demoShip);
    const { spaceManager, calls } = fakeSpaceManager(damages);
    // roll 0: every defect roll succeeds
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return { ship, state, damageManager, calls, damages };
}

function stripArmor(state: ShipState) {
    for (const plate of state.armor.armorPlates) {
        for (const layer of plate.layers) {
            layer.health = 0;
        }
    }
}

function breakPastKillRatio(damageManager: DamageManager, state: ShipState) {
    // damageAllSystems' spillover loop is capped at MAX_SPILLOVER_ROLLS per call, so one huge hit
    // isn't guaranteed to break everything breakable -- repeat.
    for (let i = 0; i < 50; i++) {
        damageManager.damageAllSystems({ id: `setup-${i}`, amount: 999 });
    }
    // the chain gun can't be broken, so "every" isn't reachable: past the ratio is a mission kill
    const total = state.systems().length;
    const broken = state.systems().filter((s) => s.broken).length;
    expect(broken).to.be.greaterThan(total * state.design.systemKillRatio);
}

describe('DamageManager death: only a breached capsule kills', () => {
    it('converts the ship to a Derelict once the capsule is breached', () => {
        const { state, damageManager, calls, damages } = setUpExpendableShip();
        state.capsule.integrity = 0;
        damages.push(hit('HiExp'));

        damageManager.update();

        expect(calls.convertToDerelict).to.deep.equal(['doomed-npc']);
        expect(calls.destroyObject).to.have.lengthOf(0);
    });

    it('does not convert with systems broken past the kill ratio while the capsule holds: a mission kill, not a death', () => {
        const { state, damageManager, calls, damages } = setUpExpendableShip();
        breakPastKillRatio(damageManager, state);
        damages.push(hit('Frag'));

        damageManager.update();

        expect(state.healthRatio).to.equal(0);
        expect(state.capsule.broken).to.equal(false);
        expect(calls.convertToDerelict).to.have.lengthOf(0);
    });

    it('does not convert when nothing damaged the ship this tick, even with the capsule breached', () => {
        const { state, damageManager, calls } = setUpExpendableShip();
        state.capsule.integrity = 0;

        damageManager.update();

        expect(calls.convertToDerelict).to.have.lengthOf(0);
    });

    it('never converts a non-expendable (player) ship, even with the capsule breached', () => {
        const { ship, state, damageManager, calls, damages } = setUpExpendableShip();
        ship.expendable = false;
        state.capsule.integrity = 0;
        damages.push(hit('HiExp'));

        damageManager.update();

        expect(calls.convertToDerelict).to.have.lengthOf(0);
    });
});

describe('Capsule', () => {
    it('is not one of the ship systems, so the kill ratio and system listings never count it', () => {
        const state = makeShipState('ship', demoShip);
        expect(state.systems()).to.not.include(state.capsule);
    });

    it('loses one defect step of integrity per defect and breaks after 1 / step defects', () => {
        const { state, damageManager } = setUpExpendableShip();
        const defects = Math.round(1 / CAPSULE_DEFECT_STEP);
        stripArmor(state);
        for (let i = 0; i < defects - 1; i++) {
            damageManager.damageSystem(state.capsule, { id: `d${i}`, amount: 1 }, 1);
        }
        expect(state.capsule.broken).to.equal(false);
        damageManager.damageSystem(state.capsule, { id: 'last', amount: 1 }, 1);
        expect(state.capsule.broken).to.equal(true);
    });

    for (const [area, arc] of [
        ['front', [0, 1]],
        ['rear', [180, 181]],
    ] as const) {
        it(`is reached by internal-hitting (HiExp) damage through the ${area} area once its armor is gone`, () => {
            const { state, damageManager } = setUpExpendableShip();
            stripArmor(state);
            damageManager.takeWeaponDamage({
                ...hit('HiExp', [arc[0], arc[1]], `hiexp-${area}`),
                damageType: 'HiExp',
                profile: damageProfiles.HiExp,
            });
            expect(state.capsule.integrity).to.be.lessThan(1);
        });
    }

    it('is never reached by external-only (Frag) damage', () => {
        const { state, damageManager } = setUpExpendableShip();
        stripArmor(state);
        for (let i = 0; i < 20; i++) {
            damageManager.takeWeaponDamage({
                ...hit('Frag', [0, 1], `frag-${i}`),
                damageType: 'Frag',
                profile: damageProfiles.Frag,
            });
        }
        expect(state.capsule.integrity).to.equal(1);
    });
});
