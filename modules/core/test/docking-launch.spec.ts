import {
    DockingMode,
    Faction,
    ShipManagerPc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

function dockedShip() {
    const spaceMgr = new SpaceManager();
    const station = new Spaceship().init('station', new Vec2(0, 0), 'large-station', Faction.Gravitas);
    spaceMgr.insert(station);
    const shipObj = new Spaceship().init('player', new Vec2(station.radius + 100, 0), 'demo-ship', Faction.Gravitas);
    shipObj.angle = 90;
    const shipMgr = new ShipManagerPc(
        shipObj,
        makeShipState(shipObj.id, shipConfigurations['demo-ship']),
        spaceMgr,
        new MockDie(),
    );
    spaceMgr.insert(shipObj);
    spaceMgr.forceFlushEntities();
    shipMgr.state.docking.targetId = station.id;
    shipMgr.state.docking.mode = DockingMode.DOCKED;
    return { spaceMgr, shipMgr, shipObj };
}

describe('Launch undock', () => {
    it('casts off and reaches full forward speed along the heading', () => {
        const { spaceMgr, shipMgr, shipObj } = dockedShip();
        shipMgr.state.docking.launchCommand = true;
        for (const id of makeIterationsData(2, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(shipMgr.state.docking.mode).to.equal(DockingMode.UNDOCKED);
        expect(shipMgr.state.docking.launchCommand).to.equal(false);
        expect(XY.lengthOf(shipObj.velocity)).to.be.closeTo(shipMgr.state.maxSpeed, 1);
        const expected = XY.byLengthAndDirection(shipMgr.state.maxSpeed, shipObj.angle);
        expect(shipObj.velocity.x).to.be.closeTo(expected.x, 1);
        expect(shipObj.velocity.y).to.be.closeTo(expected.y, 1);
    });

    it('does nothing while not docked', () => {
        const { shipMgr, shipObj } = dockedShip();
        shipMgr.state.docking.mode = DockingMode.UNDOCKED;
        shipMgr.state.docking.targetId = '';
        shipMgr.state.docking.launchCommand = true;
        const [id] = makeIterationsData(0.1, 1);
        shipMgr.update(id);
        expect(XY.lengthOf(shipObj.velocity)).to.equal(0);
    });
});
