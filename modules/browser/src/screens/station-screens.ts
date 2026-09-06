import { ScreenContainer, ScreenTeardown } from './station-lifecycle';

import { Driver } from '@starwards/core';
import { initEngineerScreen } from './engineer-screen';
import { initPilotScreen } from './pilot-screen';
import { initRelayScreen } from './relay-screen';
import { initSignalsScreen } from './signals-screen';
import { initWeaponsScreen } from './weapons-screen';

type StationScreenInit = (driver: Driver, container: ScreenContainer, shipId: string) => Promise<ScreenTeardown>;

/**
 * Every fixed-grid station screen, keyed by its `stationType` (see the stations manifest). The
 * generic `station.html` page (issue #2132) picks its screen from here once the GM assigns a
 * station a `(shipId, stationType)`; each per-screen page (`pilot.ts`, `weapons.ts`, …) also
 * calls its own entry directly for its self-assigning `?ship=` flow.
 */
export const stationScreens: Record<string, StationScreenInit> = {
    pilot: initPilotScreen,
    weapons: initWeaponsScreen,
    engineer: initEngineerScreen,
    relay: initRelayScreen,
    signals: initSignalsScreen,
};
