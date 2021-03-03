import { AdminDriver } from './admin';
import { Client } from 'colyseus.js';
import { ShipDriver } from './ship';
import { SpaceDriver } from './space';
import { schemaClasses } from '@starwards/model';
import { waitForEvents } from '../async-utils';

export { DriverNumericApi, NumberMapDriver } from './utils';

export type AdminDriver = ReturnType<typeof AdminDriver>;
export type ShipDriver = ReturnType<typeof ShipDriver>;
export type SpaceDriver = ReturnType<typeof SpaceDriver>;

// const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ENDPOINT = protocol + '//' + window.location.host; // + '/';

export const client = new Client(ENDPOINT);

let adminDriver: Promise<AdminDriver> | null = null;
export async function getAdminDriver(): Promise<AdminDriver> {
    if (adminDriver) {
        return await adminDriver;
    }
    adminDriver = client.join('admin', {}, schemaClasses.admin).then(AdminDriver);
    return await adminDriver;
}

let spaceDriver: Promise<SpaceDriver> | null = null;
export async function getSpaceDriver(): Promise<SpaceDriver> {
    if (spaceDriver) {
        return await spaceDriver;
    }
    spaceDriver = client.join('space', {}, schemaClasses.space).then(SpaceDriver);
    return await spaceDriver;
}

const shipDrivers = new Map<string, ShipDriver>();

/**
 * return a ship room after state initialization
 * @param shipId ID of the ship
 */
export async function getShipDriver(shipId: string): Promise<ShipDriver> {
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
    const shipDriver = ShipDriver(room);
    shipDrivers.set(shipId, shipDriver);
    return shipDriver;
}
