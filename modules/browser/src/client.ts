import { AdminDriver, makeAdminDriver } from './drivers/admin-driver';
import { ShipDriver, makeShipDriver } from './drivers/ship-driver';
import { SpaceDriver, makeSpaceDriver } from './drivers/space-driver';

import { Client } from 'colyseus.js';
import { schemaClasses } from '@starwards/model';
import { waitForEvents } from './async-utils';

// const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ENDPOINT = protocol + '//' + window.location.host; // + '/';

export const client = new Client(ENDPOINT);

let adminDriver: Promise<AdminDriver> | null = null;
export async function getAdminDriver() {
    if (adminDriver) {
        return await adminDriver;
    }
    adminDriver = client.join('admin', {}, schemaClasses.admin).then(makeAdminDriver);
    return await adminDriver;
}

let spaceDriver: Promise<SpaceDriver> | null = null;
export async function getSpaceDriver() {
    if (spaceDriver) {
        return await spaceDriver;
    }
    spaceDriver = client.join('space', {}, schemaClasses.space).then(makeSpaceDriver);
    return await spaceDriver;
}

const shipDrivers = new Map<string, ShipDriver>();

/**
 * return a ship room after state initialization
 * @param shipId ID of the ship
 */
export async function getShipDriver(shipId: string) {
    if (shipDrivers.has(shipId)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return shipDrivers.get(shipId)!;
    }
    const room = await client.joinById(shipId, {}, schemaClasses.ship);
    const pendingEvents = [];
    if (!room.state.chainGun) {
        pendingEvents.push('chainGun');
    }
    if (!room.state.constants) {
        pendingEvents.push('constants');
    }
    await waitForEvents(room.state.events, pendingEvents);
    const shipDriver = makeShipDriver(room);
    shipDrivers.set(shipId, shipDriver);
    return shipDriver;
}
