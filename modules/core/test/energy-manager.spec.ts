import { demoShip, makeShipState } from '../src';

import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { MockDie } from './ship-test-harness';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { expect } from 'chai';

function setUpEnergyManager() {
    const shipId = 'test-ship';
    const state = makeShipState(shipId, demoShip);
    const spaceObject = new Spaceship();
    spaceObject.id = shipId;
    const spaceManager = new SpaceManager();
    spaceManager.insert(spaceObject);
    const die = new MockDie();
    const damageManager = new DamageManager(spaceObject, state, spaceManager, die);
    const heatManager = new HeatManager(state, damageManager);
    const energyManager = new EnergyManager(state, heatManager);
    return { state, energyManager };
}

// Direct coverage of `trySpendEnergy` — `movement-manager.spec.ts` exercises the same flag only
// indirectly, through a thruster's own energy draw.
describe('EnergyManager.trySpendEnergy', () => {
    it('sets energyStarved on the drawing system when the reactor cannot cover the draw', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;
        const drawing = state.thrusters[0];

        const spent = energyManager.trySpendEnergy(10, drawing);

        expect(spent).to.equal(false);
        expect(drawing.energyStarved).to.equal(true);
    });

    it('clears energyStarved on the drawing system once the reactor can cover the draw again', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;
        const drawing = state.thrusters[0];
        energyManager.trySpendEnergy(10, drawing);
        expect(drawing.energyStarved).to.equal(true);

        state.reactor.energy = state.reactor.design.maxEnergy;
        const spent = energyManager.trySpendEnergy(10, drawing);

        expect(spent).to.equal(true);
        expect(drawing.energyStarved).to.equal(false);
    });

    it('does not mark an unrelated system energyStarved (no false positives)', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;
        const drawing = state.thrusters[0];
        const bystander = state.thrusters[1];

        energyManager.trySpendEnergy(10, drawing);

        expect(bystander.energyStarved).to.equal(false);
    });
});

// #2169 only flags the *drawing* system — a reactor sitting at zero with nothing currently trying
// to draw from it never got flagged itself, and read as fully healthy on the Full Systems Status
// panel even though it had nothing left to give.
describe('EnergyManager.update — reactor self-flag', () => {
    it('flags the reactor itself energyStarved once its own charge reaches zero, with nothing drawing', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;

        energyManager.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });

        expect(state.reactor.energyStarved).to.equal(true);
    });

    it('does not flag a reactor that still has charge', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = state.reactor.design.maxEnergy;

        energyManager.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });

        expect(state.reactor.energyStarved).to.equal(false);
    });

    it('clears the reactor energyStarved flag once regen brings it back above zero', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;
        energyManager.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });
        expect(state.reactor.energyStarved).to.equal(true);

        energyManager.update({ deltaSeconds: 100, deltaSecondsAvg: 100, totalSeconds: 100 }); // let natural regen run

        expect(state.reactor.energy).to.be.greaterThan(0);
        expect(state.reactor.energyStarved).to.equal(false);
    });
});
