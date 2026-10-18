import { BotBrain, BotStatus, BridgeSeat, Driver, RecordingEventLine, bridgeSeats } from '@starwards/core/internal';
import {
    ButtonBrain,
    Capabilities,
    Display,
    ORDERS_PANEL,
    SeatPlan,
    StationSession,
    botSeatScreen,
    buttonBrain,
    crewChannel,
    crewOrders,
    energyDrawingSeats,
    observeStation,
    orderFromCallout,
    ordersBoard,
    referenceSeatPlan,
} from '@starwards/bots';
import { liveShipContext, liveStation } from './live-station';

type ShipCrewOptions = {
    driver: Driver;
    baseUrl: URL;
    shipId: string;
    /** Receives every sidecar event while recording; the server stamps the time. */
    emit: (event: Omit<RecordingEventLine, 't'>) => void;
    onStatus: (seat: BridgeSeat, botId: string, status: BotStatus, message?: string) => void;
    /** Receives every brain error, recording or not; the supervisor prefixes the ship. */
    logError: (message: string) => void;
    /** Wall milliseconds between clock polls. */
    pollMs?: number;
    /** Overrides how a held button waits; tests pass one that only an abort ends. */
    wait?: (seconds: number, signal: AbortSignal) => Promise<void>;
};

type Seat = {
    botId: string;
    plan: SeatPlan;
    brain: ButtonBrain;
    session: StationSession;
    nextDecisionAt: number;
    busy: boolean;
    running: boolean;
    inFlight: Set<Promise<unknown>>;
};

/** Radar contacts read per decision: enough that our own shells never crowd a ship off the list. */
const RADAR_CONTACT_LIMIT = 200;

function seatPlan(seat: BridgeSeat, brain: BotBrain): SeatPlan {
    if (brain !== 'reference') {
        throw new Error(`no brain "${brain as string}"`);
    }
    return referenceSeatPlan(bridgeSeats[seat].bot);
}

/**
 * Runs the bots of one ship of a live game: each seat decides on its own cadence in game time,
 * hearing the others' callouts on the crew channel, and presses its buttons through a real station
 * session. Seats come and go while it runs; a seat still deciding skips its turn rather than queue
 * one. A seat whose brain throws logs the error, emits `brain_error` and keeps its cadence.
 */
export async function shipCrew(options: ShipCrewOptions) {
    const { shipId } = options;
    const ctx = await liveShipContext(options.driver, options.baseUrl, shipId);
    if (options.wait) ctx.wait = options.wait;
    const admin = await options.driver.getAdminDriver();
    const seats = new Map<BridgeSeat, Seat>();
    const channel = crewChannel();
    /** Seat → the console commands it offers, for binding an order to preserve energy. */
    const seatCommands = new Map<string, string[]>();
    /**
     * The ship's order board: kept here, beside the crew channel, for the seats of this ship only. It
     * is crew state, not game state, so it is never synced and no client sees it.
     */
    const orders = crewOrders(() => energyDrawingSeats(Object.fromEntries(seatCommands)));
    let ordersRecorded = 0;
    let recording = false;
    let stopped = false;
    let seconds = 0;
    let wallAt = performance.now();

    const emit = (kind: string, data: unknown) => {
        if (recording) options.emit({ kind, objectId: shipId, data });
    };
    const track = (seat: Seat, p: Promise<unknown>) => {
        seat.inFlight.add(p);
        void p.finally(() => seat.inFlight.delete(p)).catch(() => {});
    };

    async function decide(key: BridgeSeat, seat: Seat) {
        const { station } = seat.plan;
        const observed = observeStation(seat.session, { radarLimit: RADAR_CONTACT_LIMIT });
        const shown: Display = { panels: observed.panels, radar: observed.radar };
        const capabilities = observed.capabilities as unknown as Capabilities;
        seatCommands.set(
            station,
            capabilities.commands.map((c) => c.command),
        );
        orders.advance({ station, display: shown, seconds });
        // the board shows once the first order is given, so a crew without a captain reads as it always did
        const display: Display = orders.version
            ? { ...shown, panels: { ...shown.panels, [ORDERS_PANEL]: ordersBoard(orders.state, seconds) } }
            : shown;
        const heard = channel.heard(station, seconds);
        const result = await seat.brain.decide(display, capabilities, heard);
        if (seats.get(key) !== seat) {
            return;
        }
        emit('brain_request', {
            station,
            ...result.meta,
            display,
            capabilities,
            heard,
            questions: result.request.questions,
        });
        for (const said of result.callouts) {
            // said when the decision lands, as a player speaks once they have made up their mind; a fused brain speaks as the member seat
            const delivered = channel.say(said.seat ?? station, said, seconds);
            const seatTag = said.seat === undefined ? {} : { seat: said.seat };
            emit('callout', { station, ...seatTag, callout: said.callout, phrase: said.phrase, delivered });
            const own = (display.radar as { ownShip?: { position?: { x: number; y: number } } } | undefined)?.ownShip;
            const order =
                (said.seat ?? station) === 'captain' && orderFromCallout(said.callout, said.values, own?.position);
            if (order) orders.give(order, 'captain', seconds);
        }
        if (orders.version !== ordersRecorded) {
            ordersRecorded = orders.version;
            emit('orders', ordersBoard(orders.state, seconds));
        }
        for (const d of result.decisions) {
            const seatTag = d.seat === undefined ? {} : { seat: d.seat };
            emit('decision', {
                station,
                ...seatTag,
                brain: result.meta.brain,
                version: result.meta.version,
                policy: result.meta.policy,
                control: d.control,
                choice: d.choice,
                confidence: d.confidence,
                probabilities: d.probabilities,
                source: d.source,
                pressed: d.press !== undefined,
            });
            const press = d.press;
            if (press && !stopped) {
                const record = (ok: boolean, outcome: string) =>
                    emit('command', { station, ...seatTag, control: d.control, ...press, ok, result: outcome });
                track(
                    seat,
                    seat.session.execute(press.command as never, press.args, press.value).then(
                        (done) => record(true, done),
                        (e: unknown) => record(false, (e as Error).message),
                    ),
                );
            }
        }
        if (!seat.running) {
            seat.running = true;
            options.onStatus(key, seat.botId, 'running');
        }
    }

    function tick() {
        for (const [key, seat] of seats) {
            if (seat.busy || seconds + 1e-9 < seat.nextDecisionAt) {
                continue;
            }
            seat.busy = true;
            seat.nextDecisionAt = seconds + seat.plan.spec.decisionSeconds;
            track(
                seat,
                decide(key, seat)
                    .catch((e: unknown) => {
                        options.logError(`${seat.botId} on ${key} brain error: ${(e as Error).message}`);
                        emit('brain_error', { station: seat.plan.station, message: (e as Error).message });
                    })
                    .finally(() => (seat.busy = false)),
            );
        }
    }

    function addSeat(seat: BridgeSeat, botId: string, brain: BotBrain) {
        if (stopped) {
            options.onStatus(seat, botId, 'failed', 'the ship crew has stopped');
            return;
        }
        try {
            const plan = seatPlan(seat, brain);
            seats.set(seat, {
                botId,
                plan,
                brain: buttonBrain(plan.spec, plan.policy),
                session: liveStation(ctx, botSeatScreen(plan.station)),
                nextDecisionAt: seconds,
                busy: false,
                running: false,
                inFlight: new Set(),
            });
        } catch (e) {
            options.onStatus(seat, botId, 'failed', (e as Error).message);
        }
    }

    /** Removals still letting go of their seat's buttons, by seat; `stop` waits for them too. */
    const removals = new Map<BridgeSeat, Promise<void>>();

    /**
     * Lets go of every button the seat holds at once, then resolves when its decisions and presses
     * in flight are done; it never presses again. Needs no game time to pass, so it ends while paused.
     * Removing a seat already being removed returns that removal.
     */
    function removeSeat(seat: BridgeSeat): Promise<void> {
        const s = seats.get(seat);
        if (!s) return removals.get(seat) ?? Promise.resolve();
        seats.delete(seat);
        seatCommands.delete(s.plan.station);
        s.session.release();
        const earlier = removals.get(seat);
        const removal = (async () => {
            await earlier;
            while (s.inFlight.size) {
                await Promise.allSettled([...s.inFlight]);
            }
        })();
        removals.set(seat, removal);
        void removal.finally(() => {
            if (removals.get(seat) === removal) removals.delete(seat);
        });
        return removal;
    }

    const loop = (async () => {
        while (!stopped) {
            const now = performance.now();
            seconds += ((now - wallAt) / 1000) * admin.state.speed;
            wallAt = now;
            tick();
            await new Promise((r) => setTimeout(r, options.pollMs ?? 50));
        }
    })();

    return {
        addSeat,
        removeSeat,
        setRecording: (on: boolean) => void (recording = on),
        /** The ship's order board. */
        get orders() {
            return orders.state;
        },
        get seatCount() {
            return seats.size;
        },
        /** Stops deciding, lets go of every held button, and waits for every seat's removal, including ones already under way. */
        async stop() {
            stopped = true;
            await loop;
            for (const seat of [...seats.keys()]) void removeSeat(seat);
            await Promise.all([...removals.values()]);
        },
    };
}
