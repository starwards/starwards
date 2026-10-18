import { BotBrain, BridgeSeat, RecordingEventLine, createLogger } from '@starwards/core/internal';
import { BotSeats, GameManager } from '../admin/game-manager';
import { FromWorker, ToWorker, WorkerInit } from './protocol';
import { Worker } from 'node:worker_threads';
import { botWorkerSource } from './worker-source';

const { info: logInfo, error: logError } = createLogger('server:bots');

/** Wall time a stopping worker gets to drain its crew and close its connections before it is terminated. */
const STOP_GRACE_MS = 5_000;
/** Heap cap per ship worker; hitting it fails that ship's bots, not the server. */
const WORKER_HEAP_MB = 256;

/** Starts the bot worker of one ship. */
export function spawnBotWorker(init: WorkerInit, source: () => string = botWorkerSource) {
    return new Worker(source(), {
        eval: true,
        workerData: init,
        resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
}

type ShipWorker = { worker: Worker; seats: Set<BridgeSeat>; exited: Promise<void>; stopping: boolean };

/** Runs GM-seated bots: one worker per ship with bots, started on its first bot and retired with its last. */
export class BotSupervisor implements BotSeats {
    private ships = new Map<string, ShipWorker>();
    /** Workers asked to stop that have not exited yet. */
    private retiring = new Set<Promise<void>>();
    private recording = false;

    constructor(
        private manager: GameManager,
        private baseUrl: () => string,
        private onEvent: (event: Omit<RecordingEventLine, 't'>) => void,
        private source: () => string = botWorkerSource,
    ) {}

    get workerCount() {
        return this.ships.size;
    }

    start(shipId: string, seat: BridgeSeat, botId: string, brain: BotBrain) {
        const ship = this.ships.get(shipId) ?? this.spawn(shipId);
        ship.seats.add(seat);
        ship.worker.postMessage({ type: 'seat', seat, botId, brain } satisfies ToWorker);
    }

    stop(shipId: string, seat: BridgeSeat) {
        const ship = this.ships.get(shipId);
        if (!ship) return;
        ship.seats.delete(seat);
        ship.worker.postMessage({ type: 'unseat', seat } satisfies ToWorker);
        if (ship.seats.size === 0) void this.retire(shipId, ship);
    }

    /** Stops every ship's worker and resolves once all of them, and any already stopping, have exited. */
    async stopAll() {
        await Promise.all([...this.ships].map(([id, ship]) => this.retire(id, ship)));
        await Promise.all([...this.retiring]);
    }

    /** Called when the recorder starts or stops; workers post events only while it records. */
    setRecording(on: boolean) {
        this.recording = on;
        for (const { worker } of this.ships.values()) worker.postMessage({ type: 'record', on } satisfies ToWorker);
    }

    private spawn(shipId: string): ShipWorker {
        const worker = spawnBotWorker({ baseUrl: this.baseUrl(), shipId }, this.source);
        const exited = new Promise<void>((resolve) => worker.once('exit', () => resolve()));
        const ship: ShipWorker = { worker, seats: new Set(), exited, stopping: false };
        this.ships.set(shipId, ship);
        worker.postMessage({ type: 'record', on: this.recording } satisfies ToWorker);
        worker.on('message', (m: FromWorker) => {
            if (m.type === 'status') this.manager.setBotStatus(shipId, m.seat, m.botId, m.status, m.message);
            else if (m.type === 'event') this.onEvent({ kind: m.kind, objectId: m.objectId, data: m.data });
            else if (m.type === 'log') (m.level === 'error' ? logError : logInfo)(`[${shipId}] ${m.message}`);
        });
        worker.on('error', (e: Error) => this.fail(shipId, ship, e.message));
        worker.on('exit', (code) => {
            if (!ship.stopping) this.fail(shipId, ship, `bot worker exited (code ${code})`);
        });
        return ship;
    }

    private fail(shipId: string, ship: ShipWorker, message: string) {
        logError(`[${shipId}] bot worker failed: ${message}`);
        for (const seat of ship.seats) {
            const botId = this.manager.state.bots.get(shipId)?.seats.get(seat)?.id;
            if (botId) this.manager.setBotStatus(shipId, seat, botId, 'failed', message);
        }
        if (this.ships.get(shipId) === ship) this.ships.delete(shipId);
        ship.stopping = true;
        void ship.worker.terminate();
    }

    private async retire(shipId: string, ship: ShipWorker) {
        if (this.ships.get(shipId) === ship) this.ships.delete(shipId);
        if (ship.stopping) return ship.exited;
        ship.stopping = true;
        ship.worker.postMessage({ type: 'stop' } satisfies ToWorker);
        const timer = setTimeout(() => void ship.worker.terminate(), STOP_GRACE_MS);
        const done = ship.exited.then(() => clearTimeout(timer));
        this.retiring.add(done);
        await done;
        this.retiring.delete(done);
    }
}
