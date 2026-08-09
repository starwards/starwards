import {
    Faction,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    handleJsonPointerCommand,
    lockPath,
    makeShipState,
    shipConfigurations,
    unlockPath,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

function makeTestShip() {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'lockable-ship';
    shipObj.faction = Faction.Gravitas;
    const die = new MockDie();
    const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
    spaceMgr.insert(shipObj);
    // StatesToggle's constructor callback defaults maneuveringMode to VELOCITY; put it back to
    // DIRECT (unlocked) so tests start from a known, GM-recognizable baseline.
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    return { shipMgr, spaceMgr };
}

// drains the lockPath/unlockPath command queues, same as a real game tick
function tick(shipMgr: ShipManagerPc, spaceMgr: SpaceManager) {
    for (const id of makeIterationsData(0.1, 1)) {
        shipMgr.update(id);
        spaceMgr.update(id);
    }
}

describe('GM property lock (JSON paths, GM value wins)', () => {
    it('locking /smartPilot/maneuveringMode blocks the pilot-driven write; unlocking restores it', () => {
        const { shipMgr, spaceMgr } = makeTestShip();
        lockPath.setValue(shipMgr.state, '/smartPilot/maneuveringMode');
        tick(shipMgr, spaceMgr);

        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
        expect(shipMgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);

        unlockPath.setValue(shipMgr.state, '/smartPilot/maneuveringMode');
        tick(shipMgr, spaceMgr);

        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
        expect(shipMgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);
    });

    it('exposes the locked path list for the GM tweak panel to render', () => {
        const { shipMgr, spaceMgr } = makeTestShip();
        lockPath.setValue(shipMgr.state, '/hullDamaged');
        tick(shipMgr, spaceMgr);
        expect(shipMgr.state.lockedPaths.includes('/hullDamaged')).to.equal(true);

        unlockPath.setValue(shipMgr.state, '/hullDamaged');
        tick(shipMgr, spaceMgr);
        expect(shipMgr.state.lockedPaths.includes('/hullDamaged')).to.equal(false);
    });

    it('silently ignores a JSON pointer command write to a locked path; unlocking restores it', () => {
        const { shipMgr, spaceMgr } = makeTestShip();
        lockPath.setValue(shipMgr.state, '/hullDamaged');
        tick(shipMgr, spaceMgr);

        handleJsonPointerCommand({ value: true }, '/hullDamaged', shipMgr.state);
        expect(shipMgr.state.hullDamaged).to.equal(false);

        unlockPath.setValue(shipMgr.state, '/hullDamaged');
        tick(shipMgr, spaceMgr);

        handleJsonPointerCommand({ value: true }, '/hullDamaged', shipMgr.state);
        expect(shipMgr.state.hullDamaged).to.equal(true);
    });
});
