import { AdminDriver } from './admin';
import { Client } from 'colyseus.js';
import { ShipDriver } from './ship';
import { SpaceDriver } from './space';
import { schemaClasses } from '@starwards/model';
import { waitForEvents } from './async-utils';

export { DriverNumericApi, NumberMapDriver } from './utils';

export type AdminDriver = ReturnType<typeof AdminDriver>;
export type ShipDriver = ReturnType<typeof ShipDriver>;
export type SpaceDriver = ReturnType<typeof SpaceDriver>;

// const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ENDPOINT = protocol + '//' + window.location.host; // + '/';

export class Driver {
    private adminDriver: Promise<AdminDriver> | null = null;
    private spaceDriver: Promise<SpaceDriver> | null = null;
    private shipDrivers = new Map<string, Promise<ShipDriver>>();

    private client = new Client(ENDPOINT);

    async isActiveGame() {
        const rooms = await this.client.getAvailableRooms('space');
        return !!rooms.length;
    }

    /**
     * Returns a finite iterator for the IDs of the ships currently active
     */
    async getCurrentShipIds(): Promise<Iterable<string>> {
        const rooms = await this.client.getAvailableRooms('ship');
        return rooms.map((r) => r.roomId);
    }

    /**
     * infinite iterator
     */
    async *getUniqueShipIds() {
        const ships = new Set<string>();
        while (true) {
            for (const shipId of await this.getCurrentShipIds()) {
                if (!ships.has(shipId)) {
                    ships.add(shipId);
                    yield shipId;
                }
            }
            await new Promise((res) => setTimeout(res, 500));
        }
    }

    /**
     * constantly scan for new ships and return when current ship is found
     * @param shipToWaitFor id of the ship to wait for
     */
    async waitForShip(shipToWaitFor: string): Promise<void> {
        for await (const shipId of this.getUniqueShipIds()) {
            if (shipToWaitFor === shipId) {
                return;
            }
        }
    }

    async getShipDriver(shipId: string): Promise<ShipDriver> {
        if (this.shipDrivers.has(shipId)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this.shipDrivers.get(shipId)!;
        }
        const shipDriver = this.makeShipDriver(shipId);
        this.shipDrivers.set(shipId, shipDriver);
        return shipDriver;
    }

    private async makeShipDriver(shipId: string) {
        const room = await this.client.joinById(shipId, {}, schemaClasses.ship);
        const pendingEvents = [];
        if (!room.state.chainGun) {
            pendingEvents.push('chainGun');
        }
        if (!room.state.constants) {
            pendingEvents.push('constants');
        }
        await waitForEvents(room.state.events, pendingEvents);
        return ShipDriver(room);
    }

    async getSpaceDriver(): Promise<SpaceDriver> {
        if (this.spaceDriver) {
            return await this.spaceDriver;
        }
        this.spaceDriver = this.client.join('space', {}, schemaClasses.space).then(SpaceDriver);
        return await this.spaceDriver;
    }

    async getAdminDriver(): Promise<AdminDriver> {
        if (this.adminDriver) {
            return await this.adminDriver;
        }
        this.adminDriver = this.client.join('admin', {}, schemaClasses.admin).then(AdminDriver);
        return await this.adminDriver;
    }
}
