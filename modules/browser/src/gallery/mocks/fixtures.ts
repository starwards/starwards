import { HackLevel, PowerLevel, ShipState, demoShip, makeShipState } from '@starwards/core';

/**
 * Waits past the first tick of the widget's polling loop (`EmitterLoop`, 200-250ms), then for the web fonts
 * that layout started loading. The gallery pins `#container` to the widget's size right after setup, and
 * glyph widths change when a font arrives, so a scene that settles before that measures at a random width.
 */
export async function settle(ms = 400) {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
    await document.fonts.ready;
}

/** Waits until a widget has drawn something matching `selector`, for widgets that render in a later tick than their first poll. */
export async function settleUntil(container: HTMLElement, selector: string, timeoutMs = 5000) {
    const deadline = performance.now() + timeoutMs;
    while (!container.querySelector(selector)) {
        if (performance.now() > deadline) throw new Error(`widget never drew "${selector}"`);
        await settle(25);
    }
    await settle(50);
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
