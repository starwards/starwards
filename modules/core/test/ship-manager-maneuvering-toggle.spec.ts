import { ShipManagerPc, SmartPilotMode, SpaceManager, Spaceship, makeShipState, shipConfigurations } from '../src';
import { MockDie } from './ship-test-harness';

import { expect } from 'chai';

function makeShip() {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = '1';
    spaceMgr.insert(shipObj);
    return new ShipManagerPc(
        shipObj,
        makeShipState(shipObj.id, shipConfigurations['demo-ship']),
        spaceMgr,
        new MockDie(),
    );
}

function pressManeuveringToggle(shipMgr: ShipManagerPc) {
    shipMgr.state.maneuveringModeCommand = true;
    shipMgr.handleToggleSmartPilotManeuveringMode();
}

describe('ShipManagerPc maneuvering mode toggle', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('without a weapons target skips TARGET, never asks for it, and stays in step', () => {
        const shipMgr = makeShip();
        const setMode = jest.spyOn(shipMgr, 'setSmartPilotManeuveringMode');

        pressManeuveringToggle(shipMgr);
        expect(shipMgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);
        pressManeuveringToggle(shipMgr);
        expect(shipMgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);

        expect(setMode.mock.calls.map(([mode]) => mode)).to.not.include(SmartPilotMode.TARGET);
    });

    it('follows a mode that was changed elsewhere', () => {
        const shipMgr = makeShip();
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);

        pressManeuveringToggle(shipMgr);

        expect(shipMgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);
    });
});
