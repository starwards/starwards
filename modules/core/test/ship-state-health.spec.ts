import { Spaceship, demoShip, makeShipState } from '../src';

import { expect } from 'chai';

// Issue #2191: the GM has no quick read on how much damage a ship can still absorb before
// dying. `ShipState.healthRatio` gives a single 0..1 scalar so the GM can judge a fight's
// prospects without inspecting each system separately and doing head math.

function setUpShip() {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    return makeShipState(ship.id, demoShip);
}

// Forces a real system's `broken` getter to a fixed value, independent of which underlying
// defectible field a given system class actually breaks on -- healthRatio only cares about the
// broken/total count, not the mechanics of how a system got there.
function forceBroken(system: { broken: boolean }, broken: boolean) {
    Object.defineProperty(system, 'broken', { value: broken, configurable: true });
}

describe('ShipState.healthRatio (issue #2191)', () => {
    it('reports full health (1) for a fully intact ship', () => {
        const state = setUpShip();
        expect(state.healthRatio).to.equal(1);
    });

    it('decreases as systems break, and never goes up', () => {
        const state = setUpShip();
        let previous = state.healthRatio;
        for (const system of state.systems()) {
            forceBroken(system, true);
            expect(state.healthRatio).to.be.at.most(previous);
            previous = state.healthRatio;
        }
    });

    it('hits its floor (0) exactly when the ship would convert to a derelict, not before', () => {
        const state = setUpShip();
        const systems = state.systems();
        const total = systems.length;
        const killRatio = state.design.systemKillRatio;
        systems.forEach((system, index) => {
            forceBroken(system, true);
            const brokenCount = index + 1;
            const wouldDie = total * killRatio < brokenCount;
            if (wouldDie) {
                expect(state.healthRatio).to.equal(0);
            } else {
                expect(state.healthRatio).to.be.greaterThan(0);
            }
        });
    });
});
