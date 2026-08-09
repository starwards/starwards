import { ShipTestHarness } from './ship-test-harness';
import { SmartPilotMode } from '../src';

import { expect } from 'chai';

// Concrete regression from bridge testplay: `maneuveringMode` set by the GM kept
// reverting to the pilot's own choice because pilot input (`maneuveringModeCommand`)
// overwrites it every tick from inside the ship manager's update loop — a write that
// never goes through the JSON Pointer command surface the GM's own write uses.
describe('GM property lock — ship state', () => {
    const tick = (harness: ShipTestHarness) =>
        harness.shipMgr.update({ deltaSeconds: 1, deltaSecondsAvg: 1, totalSeconds: 1 });

    it('keeps a GM-locked maneuveringMode fixed while the pilot toggles it, until unlocked', () => {
        const harness = new ShipTestHarness();

        harness.shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
        harness.shipState.lockCommands.push({ path: '/smartPilot/maneuveringMode', locked: true });
        tick(harness);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);

        // pilot hits the maneuvering-mode hotkey — normally cycles the mode
        harness.shipState.maneuveringModeCommand = true;
        tick(harness);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);

        harness.shipState.lockCommands.push({ path: '/smartPilot/maneuveringMode', locked: false });
        tick(harness);
        harness.shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);
    });

    it('exposes the currently locked paths for the GM tweak panel to render', () => {
        const harness = new ShipTestHarness();

        expect(harness.shipState.lockedPaths.includes('/smartPilot/maneuveringMode')).to.equal(false);
        harness.shipState.lockCommands.push({ path: '/smartPilot/maneuveringMode', locked: true });
        tick(harness);
        expect(harness.shipState.lockedPaths.includes('/smartPilot/maneuveringMode')).to.equal(true);

        harness.shipState.lockCommands.push({ path: '/smartPilot/maneuveringMode', locked: false });
        tick(harness);
        expect(harness.shipState.lockedPaths.includes('/smartPilot/maneuveringMode')).to.equal(false);
    });

    it('refuses to lock a field outside the GM/command surface', () => {
        const harness = new ShipTestHarness();

        harness.shipState.lockCommands.push({ path: '/id', locked: true });
        tick(harness);
        expect(harness.shipState.lockedPaths.includes('/id')).to.equal(false);

        harness.shipState.id = 'renamed';
        expect(harness.shipState.id).to.equal('renamed');
    });
});
