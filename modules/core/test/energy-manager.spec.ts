import { demoShip, makeShipState } from '../src';

import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { MockDie } from './ship-test-harness';
import { PowerLevel } from '../src/ship/system';
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

const tick = (energyManager: EnergyManager, deltaSeconds: number) =>
    energyManager.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: 0 });

// Direct coverage of `drawEnergy` — `movement-manager.spec.ts` exercises the same flag only
// indirectly, through a thruster's own energy draw.
describe('EnergyManager.drawEnergy', () => {
    it('sets energyStarved on the drawing system when the reactor cannot cover the draw', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;
        const drawing = state.thrusters[0];

        const granted = energyManager.drawEnergy(10, drawing);

        expect(granted).to.equal(0);
        expect(drawing.energyStarved).to.equal(true);
    });

    it('clears energyStarved on the drawing system once the reactor can cover the draw again', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;
        const drawing = state.thrusters[0];
        energyManager.drawEnergy(10, drawing);
        expect(drawing.energyStarved).to.equal(true);

        state.reactor.energy = state.reactor.design.maxEnergy;
        tick(energyManager, 0);
        const granted = energyManager.drawEnergy(10, drawing);

        expect(granted).to.equal(1);
        expect(drawing.energyStarved).to.equal(false);
    });

    it('clears energyStarved on a starved system that stops drawing', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;
        const drawing = state.thrusters[0];
        energyManager.drawEnergy(10, drawing);
        expect(drawing.energyStarved).to.equal(true);

        const granted = energyManager.drawEnergy(0, drawing);

        expect(granted).to.equal(1);
        expect(drawing.energyStarved).to.equal(false);
    });

    it('does not mark an unrelated system energyStarved (no false positives)', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 0;
        const drawing = state.thrusters[0];
        const bystander = state.thrusters[1];

        energyManager.drawEnergy(10, drawing);

        expect(bystander.energyStarved).to.equal(false);
    });
});

// Power distribution (docs/design/mechanics/armor-and-damage.md): if total demand exceeds supply,
// all systems scale down proportionally — not first-come, first-served.
describe('EnergyManager.drawEnergy — proportional shortage', () => {
    function drawPair(firstIsSmall: boolean) {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.power = PowerLevel.SHUTDOWN; // no income: the store is the whole supply
        const [small, big] = [state.thrusters[0], state.thrusters[1]];
        state.reactor.energy = 1_000;
        // the tick that sets the demand: 10 + 90 against 1000 in store
        energyManager.drawEnergy(10, small);
        energyManager.drawEnergy(90, big);
        state.reactor.energy = 50; // half of that demand is left
        tick(energyManager, 0);
        const grants = firstIsSmall
            ? { small: energyManager.drawEnergy(10, small), big: energyManager.drawEnergy(90, big) }
            : { big: energyManager.drawEnergy(90, big), small: energyManager.drawEnergy(10, small) };
        return { state, grants, small, big };
    }

    it('grants every draw the same fraction when demand exceeds the store', () => {
        const { grants, state } = drawPair(true);

        expect(grants.small).to.be.closeTo(0.5, 1e-9);
        expect(grants.big).to.be.closeTo(0.5, 1e-9);
        expect(state.reactor.energy).to.be.closeTo(0, 1e-9);
    });

    it('grants the same fractions whichever system draws first', () => {
        const smallFirst = drawPair(true).grants;
        const bigFirst = drawPair(false).grants;

        expect(bigFirst.small).to.be.closeTo(smallFirst.small, 1e-9);
        expect(bigFirst.big).to.be.closeTo(smallFirst.big, 1e-9);
    });

    it('marks every scaled-down system energyStarved', () => {
        const { small, big } = drawPair(true);

        expect(small.energyStarved).to.equal(true);
        expect(big.energyStarved).to.equal(true);
    });

    it('grants in full when the store covers the demand', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.energy = 1_000;
        energyManager.drawEnergy(10, state.thrusters[0]);
        tick(energyManager, 0);

        expect(energyManager.drawEnergy(10, state.thrusters[0])).to.equal(1);
        expect(state.thrusters[0].energyStarved).to.equal(false);
    });

    it('shares a dry reactor’s income across all draws at steady state', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.power = PowerLevel.MAX;
        state.reactor.energy = 0;
        const dt = 1 / 60;
        const income = state.reactor.energyPerSecond * dt; // 5/s at MAX
        let small = 0;
        let big = 0;
        for (let i = 0; i < 120; i++) {
            small = energyManager.drawEnergy(income, state.thrusters[0]);
            big = energyManager.drawEnergy(3 * income, state.thrusters[1]);
            tick(energyManager, dt);
        }

        expect(small).to.be.closeTo(0.25, 1e-6);
        expect(big).to.be.closeTo(0.25, 1e-6);
    });
});

// "Only running a system above NORMAL trades heat for extra output" holds for the reactor too:
// its generated energy is its flow.
describe('EnergyManager.update — reactor power heat', () => {
    it('heats the reactor above NORMAL power by what it generates', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.power = PowerLevel.MAX;
        state.reactor.energy = 0;

        tick(energyManager, 1);

        const generated = state.reactor.design.energyPerSecond; // MAX: effectiveness 1
        expect(state.reactor.heat).to.be.closeTo(generated * state.reactor.design.energyHeat, 1e-9);
    });

    it('does not heat the reactor at NORMAL power', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.power = PowerLevel.NORMAL;
        state.reactor.energy = 0;

        tick(energyManager, 1);

        expect(state.reactor.heat).to.equal(0);
    });

    it('does not heat the reactor below the flow threshold', () => {
        const { state, energyManager } = setUpEnergyManager();
        state.reactor.power = PowerLevel.MAX;
        state.reactor.design.energyPerSecond = state.reactor.design.energyHeatEPMThreshold / 60 / 2;

        tick(energyManager, 1);

        expect(state.reactor.heat).to.equal(0);
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
