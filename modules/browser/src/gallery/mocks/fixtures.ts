import { HackLevel, PowerLevel, ShipState, demoShip, makeShipState } from '@starwards/core';

/** Waits past the first tick of the widget's polling loop (`EmitterLoop`, 200-250ms), so the screenshot is its settled state. */
export function settle(ms = 400) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** A demo ship with one system of every fault kind: broken, defective, starved, hot, hacked, under-powered. */
export function makeDamagedShip(id = 'player'): ShipState {
    const ship = makeShipState(id, demoShip);
    ship.reactor.effeciencyFactor = 0;
    ship.chainGuns[0].rateOfFireFactor = 0.4;
    ship.warp!.energyStarved = true;
    ship.thrusters[0].heat = 80;
    ship.thrusters[1].availableCapacity = 0.5;
    ship.maneuvering.hacked = HackLevel.COMPROMISED;
    ship.docking.hacked = HackLevel.DISABLED;
    ship.smartPilot.power = PowerLevel.LOW;
    ship.magazine.power = PowerLevel.SHUTDOWN;
    return ship;
}
