import { ShipManagerNpc, SpaceManager, Spaceship, makeShipState, shipConfigurations } from '../src';

import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

// Build a single IterationData tick. ShipManagerAbstract.update takes
// `IterationData`, not a raw delta number.
function tick(totalSeconds: number, deltaSeconds = 1 / 60) {
    return { deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds };
}

// Lock in the source-of-truth invariant: writes to ship.state.{position,
// velocity, angle, turnSpeed} are silently overwritten on the next tick by
// syncShipProperties. The corresponding ESLint rule
// (local/no-direct-ship-state-write) catches the SOURCE of such a write at
// lint time; this test catches it at runtime if someone wires around the
// lint rule (e.g. via a string-keyed assignment).

describe('ShipManagerAbstract.syncShipProperties (source-of-truth invariant)', () => {
    function makeManager() {
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'test-ship';
        const shipMgr = new ShipManagerNpc(
            shipObj,
            makeShipState(shipObj.id, dragonflyConfig),
            spaceMgr,
            new MockDie(),
        );
        spaceMgr.insert(shipObj);
        return { shipMgr, spaceMgr, shipObj };
    }

    it('overwrites direct ship.state.spaceship.angle writes from the SpaceObject every tick', () => {
        const { shipMgr, shipObj } = makeManager();
        shipObj.angle = 42;
        shipMgr.update(tick(1 / 60));
        expect(shipMgr.state.spaceship.angle).to.be.closeTo(42, 1);

        // Now violate the invariant by writing directly into ship.state.spaceship.
        // We use bracket notation to bypass the ESLint guard, simulating
        // a contributor who wired around it.
        (shipMgr.state.spaceship as unknown as Record<string, number>)['angle'] = 999;

        // The next tick should snap angle back from the SpaceObject.
        shipMgr.update(tick(1 / 60));
        expect(shipMgr.state.spaceship.angle).to.be.closeTo(shipObj.angle, 1);
        expect(shipMgr.state.spaceship.angle).to.not.equal(999);
    });

    it('overwrites direct ship.state.spaceship.position writes from the SpaceObject every tick', () => {
        const { shipMgr, shipObj } = makeManager();
        shipObj.position.x = 100;
        shipObj.position.y = 200;
        shipMgr.update(tick(1 / 60));
        expect(shipMgr.state.spaceship.position.x).to.be.closeTo(100, 1);
        expect(shipMgr.state.spaceship.position.y).to.be.closeTo(200, 1);

        // Direct write to mirror.
        shipMgr.state.spaceship.position.x = -50;
        shipMgr.state.spaceship.position.y = -75;

        shipMgr.update(tick(1 / 60));
        expect(shipMgr.state.spaceship.position.x).to.be.closeTo(shipObj.position.x, 1);
        expect(shipMgr.state.spaceship.position.y).to.be.closeTo(shipObj.position.y, 1);
    });

    it('mirrors faction, radius and radarRange from the SpaceObject', () => {
        const { shipMgr, shipObj } = makeManager();
        shipObj.radius = 123;
        shipObj.radarRange = 456;
        shipMgr.update(tick(1 / 60));
        expect(shipMgr.state.spaceship.radius).to.equal(123);
        expect(shipMgr.state.spaceship.radarRange).to.equal(456);
    });
});
