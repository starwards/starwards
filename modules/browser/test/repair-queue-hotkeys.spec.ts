import {
    getRepairProtocolHotkey,
    getRepairProtocolLowerHotkey,
    getRepairProtocolModeHotkey,
} from '../src/widgets/repair-queue-logic';

import { repairProtocols } from '@starwards/core';

describe('repair-queue hotkeys (issue #2255: mode toggle gesture)', () => {
    test('a field-tier protocol gets a mode hotkey that is its raise hotkey with ctrl+ added, so it never collides with ctrl+<digit> browser tab-switching', () => {
        expect(getRepairProtocolModeHotkey('actuatorRecalibration')).toBe('ctrl+alt+1');
        expect(getRepairProtocolModeHotkey('armorPlateRenewal', repairProtocols)).toBeUndefined(); // docked-tier: no mode
    });

    test('a docked/shipyard-tier protocol has no mode hotkey — nothing to toggle', () => {
        expect(getRepairProtocolModeHotkey('hullWideSystemsOverhaul')).toBeUndefined();
    });

    test('an unknown protocol id has no mode hotkey', () => {
        expect(getRepairProtocolModeHotkey('not-a-real-protocol')).toBeUndefined();
    });

    test('no hotkey is shared between raise, lower, and mode across the whole real catalog', () => {
        const keys: string[] = [];
        for (const protocolId of Object.keys(repairProtocols)) {
            const raise = getRepairProtocolHotkey(protocolId);
            const lower = getRepairProtocolLowerHotkey(protocolId);
            const mode = getRepairProtocolModeHotkey(protocolId);
            if (raise) {
                keys.push(raise);
            }
            if (lower) {
                keys.push(lower);
            }
            if (mode) {
                keys.push(mode);
            }
        }
        expect(new Set(keys).size).toBe(keys.length);
    });
});
