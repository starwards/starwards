import { AdminState, ShipState, SpaceState, schemaClasses, sleep } from '@starwards/core';
import { Client, Room } from 'colyseus.js';

import { makeDriver } from './driver';

/**
 * Represents a single test client connected to the game
 */
export class TestClient {
    private client: Client;
    private adminRoom: Room<AdminState> | null = null;
    private spaceRoom: Room<SpaceState> | null = null;
    private shipRooms = new Map<string, Room<ShipState>>();

    public readonly id: string;

    constructor(id: string, serverUrl: string) {
        this.id = id;
        this.client = new Client(serverUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/colyseus');
    }

    /**
     * Connect to the admin room
     */
    async connectAdmin(): Promise<Room<AdminState>> {
        if (this.adminRoom) return this.adminRoom;
        this.adminRoom = await this.client.joinById('admin', {}, schemaClasses.admin);
        return this.adminRoom;
    }

    /**
     * Connect to the space room
     */
    async connectSpace(): Promise<Room<SpaceState>> {
        if (this.spaceRoom) return this.spaceRoom;
        this.spaceRoom = await this.client.joinById('space', {}, schemaClasses.space);
        return this.spaceRoom;
    }

    /**
     * Connect to a specific ship room
     */
    async connectShip(shipId: string): Promise<Room<ShipState>> {
        if (this.shipRooms.has(shipId)) {
            return this.shipRooms.get(shipId)!;
        }
        const room = await this.client.joinById(shipId, {}, schemaClasses.ship);
        this.shipRooms.set(shipId, room);
        return room;
    }

    /**
     * Send a command to a room
     */
    sendCommand<T = unknown>(room: Room, type: string, message?: T): Promise<void> {
        return Promise.resolve(room.send(type, message));
    }

    /**
     * Wait for state synchronization
     * @param room The room to wait for
     * @param predicate Optional predicate to check if state is considered synced. If not provided, only checks that state exists.
     * @param timeoutMs Timeout in milliseconds
     */
    async waitForSync<T>(room: Room<T>, predicate?: (state: T) => boolean, timeoutMs = 5000): Promise<void> {
        const startTime = Date.now();

        // Poll until predicate is satisfied
        while (Date.now() - startTime < timeoutMs) {
            if (room.state !== undefined && room.state !== null) {
                // If no predicate, just check state exists
                if (!predicate) return;

                // If predicate provided, check it
                if (predicate(room.state)) return;
            }

            await sleep(50);
        }

        throw new Error(`waitForSync timeout after ${timeoutMs}ms`);
    }

    /**
     * Wait for a ship property to reach expected value
     * @param room The space room to wait for
     * @param shipId The ship ID to check
     * @param propertyPath Dot-separated path to property (e.g., 'angle', 'position.x', 'reactor.power')
     * @param expectedValue The expected value
     * @param tolerance Optional tolerance for numeric comparisons (default: 0.01)
     * @param timeoutMs Timeout in milliseconds
     */
    async waitForShipProperty(
        room: Room<SpaceState>,
        shipId: string,
        propertyPath: string,
        expectedValue: number,
        tolerance = 0.01,
        timeoutMs = 5000,
    ): Promise<void> {
        await this.waitForSync(
            room,
            (state: SpaceState) => {
                const ship = state.getShip(shipId);
                if (!ship) return false;

                // Navigate nested property path
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                const value = propertyPath.split('.').reduce((obj, key) => obj?.[key], ship as any);
                if (value === undefined || value === null) return false;

                return Math.abs((value as number) - expectedValue) <= tolerance;
            },
            timeoutMs,
        );
    }

    /**
     * Wait for a ship subsystem property to reach expected value
     * @param room The ship room to wait for
     * @param subsystem The subsystem name (e.g., 'reactor', 'radar')
     * @param property The property name (e.g., 'power')
     * @param expectedValue The expected value
     * @param tolerance Optional tolerance for numeric comparisons (default: 0.1)
     * @param timeoutMs Timeout in milliseconds
     */
    async waitForSubsystemProperty(
        room: Room<ShipState>,
        subsystem: string,
        property: string,
        expectedValue: number,
        tolerance = 0.1,
        timeoutMs = 5000,
    ): Promise<void> {
        await this.waitForSync(
            room,
            (state: ShipState) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                const sys = (state as any)[subsystem];
                if (!sys) return false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                const value = sys[property];
                if (value === undefined || value === null) return false;
                return Math.abs((value as number) - expectedValue) <= tolerance;
            },
            timeoutMs,
        );
    }

    /**
     * Get current state from a room
     */
    getState<T>(room: Room<T>): T {
        return room.state;
    }

    /**
     * Disconnect from all rooms and clean up
     */
    async disconnect(): Promise<void> {
        const rooms = [this.adminRoom, this.spaceRoom, ...Array.from(this.shipRooms.values())].filter(
            (r): r is Room => r !== null,
        );

        await Promise.all(rooms.map((room) => room.leave(true)));

        this.adminRoom = null;
        this.spaceRoom = null;
        this.shipRooms.clear();
    }
}

/**
 * Multi-client test driver that manages multiple clients for testing state synchronization
 */
export class MultiClientDriver {
    private driver: ReturnType<typeof makeDriver>;
    private clients: TestClient[] = [];

    constructor() {
        this.driver = makeDriver();
    }

    /**
     * Get the underlying single-client driver for direct server access
     */
    get serverDriver() {
        return this.driver;
    }

    /**
     * Create a new test client
     */
    createClient(id?: string): TestClient {
        const clientId = id || `client-${this.clients.length + 1}`;
        const client = new TestClient(clientId, this.driver.url());
        this.clients.push(client);
        return client;
    }

    /**
     * Get all created clients
     */
    getClients(): TestClient[] {
        return [...this.clients];
    }

    /**
     * Wait for all clients to have consistent state
     * Compares state across all clients' space rooms
     */
    async waitForConsistency(timeoutMs = 5000): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const spaceStates = this.clients.map((c) => c.getState(c['spaceRoom']!)).filter((s) => s !== undefined);

            if (spaceStates.length < 2) {
                // Need at least 2 clients to compare
                await sleep(50);
                continue;
            }

            // Compare all states using JSON serialization
            const firstStateJson = JSON.stringify(spaceStates[0].toJSON());
            const allMatch = spaceStates.every((state) => JSON.stringify(state.toJSON()) === firstStateJson);

            if (allMatch) {
                return;
            }

            await sleep(50);
        }

        throw new Error(`State consistency not reached after ${timeoutMs}ms`);
    }

    /**
     * Wait for a specific condition to be true across all clients
     */
    async waitForCondition(predicate: (client: TestClient) => boolean, timeoutMs = 5000): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            if (this.clients.every(predicate)) {
                return;
            }
            await sleep(50);
        }

        throw new Error(`Condition not met after ${timeoutMs}ms`);
    }

    /**
     * Clean up all clients
     */
    async cleanup(): Promise<void> {
        await Promise.all(this.clients.map((c) => c.disconnect()));
        this.clients = [];
    }
}

/**
 * Helper to create a multi-client driver for tests
 */
export function makeMultiClientDriver() {
    const driver = new MultiClientDriver();

    beforeEach(() => {
        // Driver's beforeEach is already called via makeDriver()
    });

    afterEach(async () => {
        await driver.cleanup();
        await sleep(10);
    });

    return driver;
}
