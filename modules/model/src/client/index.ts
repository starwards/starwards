import { AdminDriver } from './admin';
import { Client } from 'colyseus.js';
import { ShipDriver } from './ship';
import { SpaceDriver } from './space';
import { schemaClasses } from '..';

export * from './ship';
export * from './space';
export * from './utils';

export type ShipDriverRead = Pick<ShipDriver, 'state' | 'events'>;

export type AdminDriver = ReturnType<ReturnType<typeof AdminDriver>>;

export class Driver {
    public httpEndpoint: string;
    private rooms: Client;

    private adminDriver: Promise<AdminDriver> | null = null;
    private spaceDriver: Promise<SpaceDriver> | null = null;
    private shipDrivers = new Map<string, Promise<ShipDriver>>();

    /**
     *
     * @param location window.location compatible object
     */
    constructor(location: { protocol: string; host: string }) {
        const colyseusEndpoint = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/colyseus';
        this.httpEndpoint = location.protocol + '//' + location.host;
        this.rooms = new Client(colyseusEndpoint);
    }
    async isActiveGame() {
        const rooms = await this.rooms.getAvailableRooms('space');
        return !!rooms.length;
    }

    /**
     * Returns a finite iterator for the IDs of the ships currently active
     */
    async getCurrentShipIds(): Promise<Iterable<string>> {
        const rooms = await this.rooms.getAvailableRooms('ship');
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
        const room = await this.rooms.joinById(shipId, {}, schemaClasses.ship);
        return await ShipDriver(room);
    }

    async getSpaceDriver(): Promise<SpaceDriver> {
        if (this.spaceDriver) {
            return await this.spaceDriver;
        }
        this.spaceDriver = this.rooms.join('space', {}, schemaClasses.space).then(SpaceDriver);
        return await this.spaceDriver;
    }

    async getAdminDriver(): Promise<AdminDriver> {
        if (this.adminDriver) {
            return await this.adminDriver;
        }
        this.adminDriver = this.rooms.join('admin', {}, schemaClasses.admin).then(AdminDriver(this.httpEndpoint));
        return await this.adminDriver;
    }
}
