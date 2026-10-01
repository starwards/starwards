import { AdminDriver, Driver, GameStatus, ShipDriver, SpaceDriver, sleep } from '@starwards/core';
import { ReplaySession } from './replay-session';

/**
 * A `Driver` whose rooms are a recording being replayed (see `ReplaySession`) instead of a server.
 * Everything built on a `Driver` — the GM radar, tweak panel, per-ship widgets — runs against it
 * unchanged. It is read-only: rooms swallow every command, and nothing here touches the network.
 */
export class ReplayDriver extends Driver {
    private replayAdmin: Promise<AdminDriver> | null = null;
    private replaySpace: Promise<SpaceDriver> | null = null;
    private replayShips = new Map<string, Promise<ShipDriver>>();
    private destroyed = false;

    constructor(private session: ReplaySession) {
        super(window.location);
    }

    // `Driver`'s constructor calls this before subclass fields exist, so it must not use them
    override onGameStateChange(cb: () => unknown): () => void {
        void cb();
        return () => undefined;
    }

    override connect() {
        return this;
    }

    override destroy() {
        this.destroyed = true;
    }

    override get isConnected() {
        return true;
    }

    override get errorMessage() {
        return null;
    }

    override getGameStatus() {
        return Promise.resolve(GameStatus.RUNNING);
    }

    override getAdminDriver(): Promise<AdminDriver> {
        this.replayAdmin ??= AdminDriver(this.httpEndpoint)(this.session.admin as never);
        return this.replayAdmin;
    }

    override getSpaceDriver(): Promise<SpaceDriver> {
        this.replaySpace ??= SpaceDriver(this.session.space as never);
        return this.replaySpace;
    }

    override async getShipDriver(shipId: string): Promise<ShipDriver> {
        await this.waitForShip(shipId);
        let driver = this.replayShips.get(shipId);
        if (!driver) {
            driver = ShipDriver(this.session.ships.get(shipId) as never);
            this.replayShips.set(shipId, driver);
        }
        return driver;
    }

    override async waitForShip(shipToWaitFor: string): Promise<void> {
        while (!this.destroyed && !this.session.ships.has(shipToWaitFor)) {
            await sleep(100);
        }
    }

    override async getCurrentShipIds(): Promise<Iterable<string>> {
        return (await this.getAdminDriver()).state.shipIds;
    }

    override async getCurrentPlayerShipIds(): Promise<Iterable<string>> {
        return (await this.getAdminDriver()).state.playerShipIds;
    }

    override async doesShipExist(shipId: string): Promise<boolean> {
        return (await this.getAdminDriver()).state.shipIds.includes(shipId);
    }

    override async *getUniqueShipIds() {
        const yielded = new Set<string>();
        while (!this.destroyed) {
            for (const shipId of await this.getCurrentShipIds()) {
                if (!yielded.has(shipId)) {
                    yielded.add(shipId);
                    yield shipId;
                }
            }
            await sleep(500);
        }
    }

    override waitForGame(): Promise<void> {
        return Promise.resolve();
    }

    override clearCache = () => undefined;

    override getNetworkInfo() {
        return Promise.resolve({ port: 0, addresses: [] });
    }
}
