import {
    ButtonBrain,
    Capabilities,
    Display,
    Heard,
    ORDERS_PANEL,
    OrderCommand,
    OrdersBoard,
    SeatPlan,
    StationSession,
    buttonBrain,
    crewChannel,
    crewDoctrine,
    energyDrawingSeats,
    observeStation,
    orderCommand,
    orderFromCallout,
    orderReports,
    readBoard,
    sendOrderCommand,
} from '@starwards/bots';
import { SimClock, headlessStation } from '../console/headless';
import { appendRows, decisionRow } from '../brain/decision-ledger';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { HeadlessRecorder } from '@starwards/server/src/test/headless-recorder';
import { jevCacheKey } from '../brain/jev-cache';

/** Radar contacts read per decision: enough that our own shells never crowd a ship off the list. */
const RADAR_CONTACT_LIMIT = 200;

export type CrewOptions = {
    shipId: string;
    seats: readonly SeatPlan[];
    /** Simulated seconds between a decision and its buttons reaching the ship, as on a live network. */
    latencySeconds: number;
    /** Radar contacts shown per decision. */
    radarLimit?: number;
    /** The crew's doctrine fills every board slot no captain order holds. */
    doctrine?: boolean;
    /**
     * Called before the seats decide on every tick, with the ship's order board and a way to send it
     * commands: a branch changes the orders at its branch point here.
     */
    intervene?: (seconds: number, board: OrdersBoard | undefined, send: (c: OrderCommand) => void) => void;
    /** Per station, what that seat is shown instead of its console: a branch narrowing what the captain sees. */
    lens?: Record<string, (display: Display, seconds: number) => Display>;
    /** Appends one decision-ledger row per Jev decision to `file` (docs/integration/ai-training-k3s.md). */
    decisionLedger?: { file: string; run: string; scenario: string; seed: number; recording: string };
};

/** Per control, over a whole run: how often each option was chosen and how sure the brain was. */
export type ControlStats = {
    decisions: number;
    confident: number;
    confidenceSum: number;
    choices: Record<string, number>;
};

type Seat = { plan: SeatPlan; brain: ButtonBrain; session: StationSession; nextDecisionAt: number };
/** What a seat was shown and heard when it was asked: recorded with the answer it led to. */
type Asked = { seat: Seat; display: Display; capabilities: Capabilities; heard: Heard[] };
type Pending = {
    at: number;
    seat: Seat;
    control: string;
    /** The member seat of a multiplexed station that this press is for. */
    member?: string;
    press: { command: string; args: Record<string, unknown>; value?: number | boolean | string };
};

/**
 * Runs a crew of station brains on one ship of a headless game. Call `beforeTick` before every
 * tick: it lets each seat decide on its own cadence, hearing the others' callouts on the crew
 * channel, applies buttons once their latency has passed, and records every request, decision,
 * callout and command beside the recording.
 *
 * The seats due on the same tick are asked together: each reads its console and the channel before
 * any of them answers, their answers are awaited in parallel, and requests, callouts and decisions
 * are then recorded in seat order. A callout is therefore heard from the listener's next decision
 * on, as in a live game where it is said once the speaker's decision lands, and a run does not
 * depend on which answer came back first.
 */
export function headlessCrew(options: CrewOptions) {
    let game: HeadlessGame;
    let clock: SimClock;
    let seats: Seat[] = [];
    let pending: Pending[] = [];
    const stats = {
        decisions: 0,
        commands: 0,
        refused: 0,
        fallbacks: 0,
        inputTokens: 0,
        /** Callouts put on the air, and callouts suppressed as repeats. */
        callouts: 0,
        suppressed: 0,
        controls: {} as Record<string, ControlStats>,
    };
    let channel = crewChannel();
    let doctrine = options.doctrine ? crewDoctrine() : undefined;
    let energySeats: string[] = [];
    let recordedBoard = '';
    const shipState = () => game.shipManagers.get(options.shipId)!.state;
    const boardNow = () => readBoard(shipState().orderBoard, energySeats);
    /** Order commands go through the ship's command path, as a seat's session sends them. */
    const send = (c: OrderCommand) => sendOrderCommand(seats[0].session.shipDriver, c);

    /** The crew boards the game it is first called with: the training loop creates the game itself. */
    function board(boarded: HeadlessGame) {
        game = boarded;
        clock = new SimClock(game.seconds);
        channel = crewChannel();
        seats = options.seats.map((plan) => ({
            plan,
            brain: buttonBrain(plan.spec, plan.policy),
            session: headlessStation(game, options.shipId, plan.station, clock),
            nextDecisionAt: game.seconds,
        }));
        // an order to preserve energy binds every seat whose console spends it
        energySeats = energyDrawingSeats(
            Object.fromEntries(
                seats.map((s) => [
                    s.plan.station,
                    (observeStation(s.session, { radarLimit: 0 }).capabilities as unknown as Capabilities).commands.map(
                        (c) => c.command,
                    ),
                ]),
            ),
        );
        doctrine = options.doctrine ? crewDoctrine() : undefined;
        recordedBoard = '';
    }

    async function beforeTick(ticked: HeadlessGame, recorder: HeadlessRecorder) {
        if (ticked !== game) {
            board(ticked);
        }
        await clock.advance(game.seconds);
        options.intervene?.(game.seconds, boardNow(), send);
        const asked = seats.filter((seat) => game.seconds + 1e-9 >= seat.nextDecisionAt).map(observe);
        const results = await Promise.all(
            asked.map(({ seat, display, capabilities, heard }) => seat.brain.decide(display, capabilities, heard)),
        );
        asked.forEach((ask, i) => land(ask, results[i], recorder));
        doctrine?.commands(boardNow()).forEach(send);
        recordOrders(recorder);
        const due = pending.filter((p) => p.at <= game.seconds + 1e-9);
        pending = pending.filter((p) => p.at > game.seconds + 1e-9);
        for (const p of due) {
            execute(p, recorder);
        }
    }

    function observe(seat: Seat): Asked {
        seat.nextDecisionAt = game.seconds + seat.plan.spec.decisionSeconds;
        const observed = observeStation(seat.session, { radarLimit: options.radarLimit ?? RADAR_CONTACT_LIMIT });
        const shown: Display = { panels: observed.panels, radar: observed.radar };
        const orders = boardNow();
        orderReports(orders, { station: seat.plan.station, display: shown, seconds: game.seconds }).forEach(send);
        doctrine?.see(seat.plan.station, shown);
        // the board shows once an order was ever given, so a crew with neither captain nor doctrine reads none
        const panels = orders ? { ...shown.panels, [ORDERS_PANEL]: orders } : shown.panels;
        const lens = options.lens?.[seat.plan.station];
        const display = { ...shown, panels };
        return {
            seat,
            display: lens ? lens(display, game.seconds) : display,
            capabilities: observed.capabilities as unknown as Capabilities,
            heard: channel.heard(seat.plan.station, game.seconds),
        };
    }

    function land(
        { seat, display, capabilities, heard }: Asked,
        result: Awaited<ReturnType<ButtonBrain['decide']>>,
        recorder: HeadlessRecorder,
    ) {
        const { station } = seat.plan;
        // the raw display and capabilities, not the request's filtered copy, so `reask` can rebuild the
        // request any later brain would have asked from exactly what this station showed
        recorder.record('brain_request', options.shipId, {
            station,
            ...result.meta,
            display,
            capabilities,
            heard,
            questions: result.request.questions,
        });
        for (const said of result.callouts) {
            // a fused brain speaks as the member seat, so it hears itself next decision as the split crew would
            const delivered = channel.say(said.seat ?? station, said, game.seconds);
            const order =
                (said.seat ?? station) === 'captain' &&
                orderFromCallout(
                    said.callout,
                    said.values,
                    (display.radar as { ownShip?: { position?: { x: number; y: number } } } | undefined)?.ownShip
                        ?.position,
                );
            const command = order && orderCommand(order, 'captain');
            if (command) send(command);
            doctrine?.hear(said.seat ?? station, said, display);
            stats[delivered ? 'callouts' : 'suppressed']++;
            recorder.record('callout', options.shipId, {
                station,
                ...(said.seat === undefined ? {} : { seat: said.seat }),
                callout: said.callout,
                phrase: said.phrase,
                delivered,
            });
        }
        for (const d of result.decisions) {
            recorder.record('decision', options.shipId, {
                station,
                ...(d.seat === undefined ? {} : { seat: d.seat }),
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
            stats.decisions++;
            const control = (stats.controls[`${d.seat ?? station}/${d.control}`] ??= {
                decisions: 0,
                confident: 0,
                confidenceSum: 0,
                choices: {},
            });
            control.decisions++;
            control.choices[d.choice] = (control.choices[d.choice] ?? 0) + 1;
            if (d.confidence !== undefined) {
                control.confident++;
                control.confidenceSum += d.confidence;
            }
            if (d.source === 'fallback') {
                stats.fallbacks++;
            }
            if (d.press) {
                pending.push({
                    at: game.seconds + options.latencySeconds,
                    seat,
                    control: d.control,
                    member: d.seat,
                    press: d.press,
                });
            }
        }
        stats.inputTokens += result.meta.inputTokens ?? 0;
        ledger(seat, result);
    }

    /** One ledger row per decision of a Jev request; the request's tokens are charged to its first decision. */
    function ledger(seat: Seat, result: Awaited<ReturnType<ButtonBrain['decide']>>) {
        const target = options.decisionLedger;
        if (!target || result.meta.policy !== 'jev') return;
        const cacheKey = jevCacheKey(result.request, seat.plan.spec.model);
        // the metered client answers a cached request with no tokens and no latency
        const cacheHit = !result.meta.inputTokens && !result.meta.latencyMs;
        appendRows(
            target.file,
            result.decisions.map((d, i) =>
                decisionRow({
                    run: target.run,
                    scenario: target.scenario,
                    seed: target.seed,
                    seat: d.seat ?? seat.plan.station,
                    t: game.seconds,
                    control: d.control,
                    origin: 'play',
                    recording: target.recording,
                    brain: result.meta.brain,
                    version: result.meta.version,
                    model: result.meta.model ?? seat.plan.spec.model,
                    cacheKey,
                    cacheHit,
                    inputTokens: i === 0 ? (result.meta.inputTokens ?? 0) : 0,
                    choice: d.choice,
                    confidence: d.confidence ?? null,
                    probabilities: d.probabilities ?? null,
                }),
            ),
        );
    }

    /** Records the board as an `orders` event whenever it changed since the last one. */
    function recordOrders(recorder: HeadlessRecorder) {
        const key = JSON.stringify(shipState().orderBoard.slots.toJSON());
        if (key === recordedBoard) return;
        recordedBoard = key;
        const shownBoard = boardNow();
        if (shownBoard) recorder.record('orders', options.shipId, shownBoard);
    }

    function execute({ seat, control, member, press }: Pending, recorder: HeadlessRecorder) {
        const record = (ok: boolean, result: string) => {
            stats.commands++;
            if (!ok) {
                stats.refused++;
            }
            recorder.record('command', options.shipId, {
                station: seat.plan.station,
                ...(member === undefined ? {} : { seat: member }),
                control,
                ...press,
                ok,
                result,
            });
        };
        // a held trigger resolves only after simulated time passes, so it must not stall the tick
        seat.session.execute(press.command as never, press.args, press.value).then(
            (result) => record(true, result),
            (e: unknown) => record(false, (e as Error).message),
        );
    }

    return {
        beforeTick,
        stats,
        /** The ship's order board as the seats read it. */
        get orders() {
            return boardNow();
        },
    };
}
