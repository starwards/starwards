import { ShipTestHarness } from './ship-test-harness';
import { SmartPilotMode } from '../src';

import { expect } from 'chai';
import { handleGmSetValueCommand } from '../src/commands';
import { isFieldLocked } from '../src/lock-registry';
import { resetShipState } from '../src/ship/ship-manager-abstract';

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

    it('lets a GM write through a locked field, and the GM value survives further pilot input', () => {
        const harness = new ShipTestHarness();

        harness.shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
        harness.shipState.lockCommands.push({ path: '/smartPilot/maneuveringMode', locked: true });
        tick(harness);

        // GM overrides the lock via the GM channel
        const handled = handleGmSetValueCommand(
            { path: '/smartPilot/maneuveringMode', value: SmartPilotMode.DIRECT },
            harness.shipState,
        );
        expect(handled).to.equal(true);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);

        // pilot hits the maneuvering-mode hotkey — still blocked, GM's value holds
        harness.shipState.maneuveringModeCommand = true;
        tick(harness);
        expect(harness.shipState.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);
    });

    // NPC<->PC conversion (`game-manager.ts`) clones the whole ShipState tree into fresh Schema
    // instances before handing it to a new ShipManager (which runs `resetShipState`). The lock
    // registry is keyed by instance identity, so it has nothing for the clone's instances even
    // though `lockedPaths` (plain synced strings) survives the clone — reproduce that exact
    // sequence here rather than poking the registry directly.
    it('rehydrates the lock registry from lockedPaths across a clone + reset (NPC<->PC conversion)', () => {
        const harness = new ShipTestHarness();
        harness.shipState.lockCommands.push({ path: '/smartPilot/maneuveringMode', locked: true });
        tick(harness);
        expect(harness.shipState.lockedPaths.includes('/smartPilot/maneuveringMode')).to.equal(true);

        const cloned = harness.shipState.clone();
        // the clone's smartPilot is a brand new instance: the old registry entry doesn't apply to it
        expect(isFieldLocked(cloned.smartPilot, 'maneuveringMode')).to.equal(false);
        expect(cloned.lockedPaths.includes('/smartPilot/maneuveringMode')).to.equal(true);

        resetShipState(cloned);
        expect(isFieldLocked(cloned.smartPilot, 'maneuveringMode')).to.equal(true);
        cloned.smartPilot.maneuveringMode = SmartPilotMode.VELOCITY;
        expect(cloned.smartPilot.maneuveringMode).to.not.equal(SmartPilotMode.VELOCITY);
    });

    it('prunes a lockedPaths entry that no longer resolves to a commandable field on reset', () => {
        const harness = new ShipTestHarness();
        harness.shipState.lockedPaths.push('/no/such/field');

        resetShipState(harness.shipState);

        expect(harness.shipState.lockedPaths.includes('/no/such/field')).to.equal(false);
    });
});
