import { ShipManagerPc, SmartPilotMode, SpaceManager, Spaceship, makeShipState, shipConfigurations } from '../src';
import { MockDie } from './ship-test-harness';

import { expect } from 'chai';

describe('ShipManagerPc rotation mode toggle', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('cycling rotation mode without a weapons target never asks for TARGET', () => {
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = '1';
        spaceMgr.insert(shipObj);
        const shipMgr = new ShipManagerPc(
            shipObj,
            makeShipState(shipObj.id, shipConfigurations['demo-ship']),
            spaceMgr,
            new MockDie(),
        );
        const setMode = jest.spyOn(shipMgr, 'setSmartPilotRotationMode');

        shipMgr.state.rotationModeCommand = true;
        shipMgr.handleToggleSmartPilotRotationMode();

        expect(setMode.mock.calls.map(([mode]) => mode)).to.not.include(SmartPilotMode.TARGET);
        expect(shipMgr.state.smartPilot.rotationMode).to.equal(SmartPilotMode.VELOCITY);
    });
});
