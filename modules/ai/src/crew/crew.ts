import { ButtonBrain, Policy, buttonBrain } from '../brain/brain';
import { SimClock, headlessStation } from '../console/headless';

import { BrainSpec } from '../brain/spec';
import { Capabilities } from '../brain/controls';
import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { HeadlessRecorder } from '@starwards/server/src/test/headless-recorder';
import { StationSession } from '@starwards/mcp/src/sandbox/session';
import { crewChannel } from './channel';
import { observeStation } from '@starwards/mcp/src/sandbox/console';

/** Radar contacts read per decision: enough that our own shells never crowd a ship off the list. */
const RADAR_CONTACT_LIMIT = 200;
/** One seat of a crew: a station, the brain that plays it, and what answers its questions. */
export type SeatPlan = { station: string; spec: BrainSpec; policy: Policy };

type CrewOptions = {
    shipId: string;
    seats: readonly SeatPlan[];
    /** Simulated seconds between a decision and its buttons reaching the ship, as on a live network. */
    latencySeconds: number;
    /** Radar contacts shown per decision. */
    radarLimit?: number;
};

/** Per control, over a whole run: how often each option was chosen and how sure the brain was. */
export type ControlStats = {
    decisions: number;
    confident: number;
    confidenceSum: number;
    choices: Record<string, number>;
};

type Seat = { plan: SeatPlan; brain: ButtonBrain; session: StationSession; nextDecisionAt: number };
type Pending = {
    at: number;
    seat: Seat;
    control: string;
    press: { command: string; args: Record<string, unknown>; value?: number | boolean };
};

/**
 * Runs a crew of station brains on one ship of a headless game. Call `beforeTick` before every
 * tick: it lets each seat decide on its own cadence, hearing the others' callouts on the crew
 * channel, applies buttons once their latency has passed, and records every request, decision,
 * callout and command beside the recording.
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
    }

    async function beforeTick(ticked: HeadlessGame, recorder: HeadlessRecorder) {
        if (ticked !== game) {
            board(ticked);
        }
        await clock.advance(game.seconds);
        for (const seat of seats) {
            if (game.seconds + 1e-9 < seat.nextDecisionAt) {
                continue;
            }
            seat.nextDecisionAt = game.seconds + seat.plan.spec.decisionSeconds;
            await decide(seat, recorder);
        }
        const due = pending.filter((p) => p.at <= game.seconds + 1e-9);
        pending = pending.filter((p) => p.at > game.seconds + 1e-9);
        for (const p of due) {
            execute(p, recorder);
        }
    }

    async function decide(seat: Seat, recorder: HeadlessRecorder) {
        const observed = observeStation(seat.session, { radarLimit: options.radarLimit ?? RADAR_CONTACT_LIMIT });
        const display = { panels: observed.panels, radar: observed.radar };
        const capabilities = observed.capabilities as unknown as Capabilities;
        const { station } = seat.plan;
        const heard = channel.heard(station, game.seconds);
        const result = await seat.brain.decide(display, capabilities, heard);
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
        if (result.callout) {
            const delivered = channel.say(station, result.callout, game.seconds);
            stats[delivered ? 'callouts' : 'suppressed']++;
            recorder.record('callout', options.shipId, { station, phrase: result.callout, delivered });
        }
        for (const d of result.decisions) {
            recorder.record('decision', options.shipId, {
                station,
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
            const control = (stats.controls[`${station}/${d.control}`] ??= {
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
                pending.push({ at: game.seconds + options.latencySeconds, seat, control: d.control, press: d.press });
            }
        }
        stats.inputTokens += result.meta.inputTokens ?? 0;
    }

    function execute({ seat, control, press }: Pending, recorder: HeadlessRecorder) {
        const record = (ok: boolean, result: string) => {
            stats.commands++;
            if (!ok) {
                stats.refused++;
            }
            recorder.record('command', options.shipId, { station: seat.plan.station, control, ...press, ok, result });
        };
        // a held trigger resolves only after simulated time passes, so it must not stall the tick
        seat.session.execute(press.command as never, press.args, press.value).then(
            (result) => record(true, result),
            (e: unknown) => record(false, (e as Error).message),
        );
    }

    return { beforeTick, stats };
}
