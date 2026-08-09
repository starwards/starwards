import { SmartPilotMode, getJsonPointer } from '../src';

import { ShipTestHarness } from './ship-test-harness';
import { expect } from 'chai';

// GM tweak panel per-property lock (issue #2139).
// "GM value wins": once a JSON-pointer-addressed property is locked, every write to it — whether
// from the GM tweak panel itself or from game logic (pilot input, automation, movement manager) —
// is silently ignored until the property is unlocked again.

describe('GM tweak panel: per-property lock', () => {
    it('a locked property ignores further JSON Pointer writes; unlocking restores normal writes', () => {
        const harness = new ShipTestHarness();
        const pointer = getJsonPointer('/smartPilot/maneuveringMode')!;

        pointer.set(harness.shipState, SmartPilotMode.VELOCITY);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);

        harness.shipState.propertyLockCommands.push({ pointer: '/smartPilot/maneuveringMode', locked: true });
        harness.shipMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });
        expect(harness.shipState.propertyLocks.includes('/smartPilot/maneuveringMode')).to.equal(true);

        pointer.set(harness.shipState, SmartPilotMode.DIRECT);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);

        harness.shipState.propertyLockCommands.push({ pointer: '/smartPilot/maneuveringMode', locked: false });
        harness.shipMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });
        expect(harness.shipState.propertyLocks.includes('/smartPilot/maneuveringMode')).to.equal(false);

        pointer.set(harness.shipState, SmartPilotMode.DIRECT);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);
    });

    it('a locked maneuveringMode is not overwritten by pilot/automation logic (concrete bug from play)', () => {
        const harness = new ShipTestHarness();
        harness.shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);

        harness.shipState.propertyLockCommands.push({ pointer: '/smartPilot/maneuveringMode', locked: true });
        harness.shipMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

        // Simulate the pilot toggling maneuvering mode via the joystick/station command flag —
        // this is the exact write path described in the issue ("pilot input/joystick sync
        // overwriting it"), which bypasses the JSON Pointer command surface entirely.
        harness.shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);

        harness.shipState.propertyLockCommands.push({ pointer: '/smartPilot/maneuveringMode', locked: false });
        harness.shipMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

        harness.shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);
    });
});
