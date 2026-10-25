import { HackLevel } from './system';
import type { ShipState } from './ship-state';

/** Catalog id of the repair protocol that counters beam hacking. */
export const FIREWALL_PROTOCOL_ID = 'firewallRepair';

/** Ends every offline window beam hacking opened on `state`: what completing a firewall repair does. */
export function clearHacks(state: ShipState): void {
    for (const system of state.systems()) {
        system.hackedSecondsLeft = 0;
        if (system.hacked === HackLevel.DISABLED) {
            system.hacked = HackLevel.OK;
        }
    }
}

/** Counts down the offline windows open on `state`; a system recovers when its window closes. */
export function tickHackWindows(state: ShipState, deltaSeconds: number): void {
    for (const system of state.systems()) {
        if (system.hackedSecondsLeft <= 0) {
            continue;
        }
        system.hacked = HackLevel.DISABLED;
        system.hackedSecondsLeft = Math.max(0, system.hackedSecondsLeft - deltaSeconds);
        if (system.hackedSecondsLeft === 0) {
            system.hacked = HackLevel.OK;
        }
    }
}
