import { demoShip, makeShipState } from '../src';

import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { MockDie } from './ship-test-harness';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { expect } from 'chai';

function setUpShip() {
    const shipId = 'test-ship';
    const state = makeShipState(shipId, demoShip);
    const spaceObject = new Spaceship();
    spaceObject.id = shipId;
    const spaceManager = new SpaceManager();
    spaceManager.insert(spaceObject);
    const damageManager = new DamageManager(spaceObject, state, spaceManager, new MockDie());
    const heatManager = new HeatManager(state, damageManager);
    const energyManager = new EnergyManager(state, heatManager);
    return { state, energyManager };
}

describe('EnergyManager.trySpendEnergy', () => {
    it('marks the requesting system energyStarved when the reactor cannot cover the cost', () => {
        const { state, energyManager } = setUpShip();
        const thruster = state.thrusters[0];
        state.reactor.energy = 0;

        const spent = energyManager.trySpendEnergy(10, thruster);

        expect(spent).to.equal(false);
        expect(thruster.energyStarved).to.equal(true);
    });

    it('clears energyStarved on the next successful spend', () => {
        const { state, energyManager } = setUpShip();
        const thruster = state.thrusters[0];
        state.reactor.energy = 0;
        energyManager.trySpendEnergy(10, thruster);
        expect(thruster.energyStarved).to.equal(true);

        state.reactor.energy = state.reactor.design.maxEnergy;
        const spent = energyManager.trySpendEnergy(10, thruster);

        expect(spent).to.equal(true);
        expect(thruster.energyStarved).to.equal(false);
    });

    it('never sets energyStarved on a system that was not passed in (no false positives on unrelated systems)', () => {
        const { state, energyManager } = setUpShip();
        state.reactor.energy = 0;

        energyManager.trySpendEnergy(10, state.thrusters[0]);

        expect(state.thrusters[1].energyStarved).to.equal(false);
    });
});

describe('EnergyManager.update — reactor energyStarved', () => {
    it('marks the reactor itself energyStarved once its energy is depleted', () => {
        const { state, energyManager } = setUpShip();
        state.reactor.effeciencyFactor = 0; // stops regeneration, matching the reported "reactor too damaged to replenish energy" scenario
        state.reactor.energy = 0;

        energyManager.update({ deltaSeconds: 1, deltaSecondsAvg: 1, totalSeconds: 1 });

        expect(state.reactor.energyStarved).to.equal(true);
    });

    it('is not energyStarved while it holds a charge', () => {
        const { state, energyManager } = setUpShip();
        state.reactor.energy = state.reactor.design.maxEnergy;

        energyManager.update({ deltaSeconds: 1, deltaSecondsAvg: 1, totalSeconds: 1 });

        expect(state.reactor.energyStarved).to.equal(false);
    });
});
