import { AdminDriver, Driver, RecordingEventLine } from '@starwards/core/internal';
import { ButtonBrain, buttonBrain } from '../brain/brain';

import { Capabilities } from '../brain/controls';
import { SeatPlan } from '../crew/crew';
import { StationSession } from '@starwards/mcp/src/sandbox/session';
import { crewChannel } from '../crew/channel';
import { liveStation } from '../console/live';
import { observeStation } from '@starwards/mcp/src/sandbox/console';

type LiveCrewOptions = {
    driver: Driver;
    baseUrl: URL;
    shipId: string;
    seats: readonly SeatPlan[];
    /** Receives every sidecar event, in the same kinds and payloads the headless crew records. */
    write: (event: RecordingEventLine) => void;
    /** Stamp events with the server recording's time instead of the crew's own. */
    record?: boolean;
    /** Radar contacts shown per decision. */
    radarLimit?: number;
    /** Wall milliseconds between clock polls. */
    pollMs?: number;
};

type Seat = {
    plan: SeatPlan;
    brain: ButtonBrain;
    session: StationSession;
    close: () => void;
    nextDecisionAt: number;
    busy: boolean;
};

/** Radar contacts read per decision: enough that our own shells never crowd a ship off the list. */
const RADAR_CONTACT_LIMIT = 200;
/**
 * Game time as a live client sees it: wall time scaled by the admin speed, standing still while the
 * game is paused. With `record`, it follows the server recording's own clock, interpolated between
 * the frames that update it.
 */
function gameClock(admin: AdminDriver, record: boolean) {
    let wallAt = performance.now();
    let seconds = 0;
    let recorded = admin.state.recordingSeconds;
    let recordedAt = wallAt;
    let stamp = 0;
    return {
        /** Game seconds since the crew started. */
        get seconds() {
            return seconds;
        },
        /** Event time: since the crew started, or since the recording started. Never runs backwards. */
        get stamp() {
            return stamp;
        },
        poll() {
            const now = performance.now();
            const speed = admin.state.speed;
            seconds += ((now - wallAt) / 1000) * speed;
            wallAt = now;
            if (record) {
                if (admin.state.recordingSeconds !== recorded) {
                    recorded = admin.state.recordingSeconds;
                    recordedAt = now;
                }
                stamp = Math.max(stamp, recorded + ((now - recordedAt) / 1000) * speed);
            } else {
                stamp = seconds;
            }
        },
    };
}

/**
 * Runs a crew of station brains on one ship of a live game: each seat decides on its own cadence in
 * game time, hearing the others' callouts on the crew channel, and presses its buttons through a real
 * station session; every request, decision, callout, command and brain failure is written as a
 * sidecar event. A seat whose brain throws is recorded and
 * keeps its cadence; the other seats are not affected.
 */
export async function liveCrew(options: LiveCrewOptions) {
    const { driver, shipId, write } = options;
    const admin = await driver.getAdminDriver();
    const seats: Seat[] = [];
    for (const plan of options.seats) {
        const { session, close } = await liveStation(driver, options.baseUrl, shipId, plan.station);
        seats.push({
            plan,
            brain: buttonBrain(plan.spec, plan.policy),
            session,
            close,
            nextDecisionAt: 0,
            busy: false,
        });
    }
    const clock = gameClock(admin, options.record ?? false);
    const inFlight = new Set<Promise<unknown>>();
    const stats = {
        decisions: 0,
        commands: 0,
        refused: 0,
        fallbacks: 0,
        brainErrors: 0,
        inputTokens: 0,
        callouts: 0,
        suppressed: 0,
    };
    const channel = crewChannel();
    let stopped = false;

    const emit = (kind: string, data: unknown) => write({ t: clock.stamp, kind, objectId: shipId, data });
    const track = (p: Promise<unknown>) => {
        inFlight.add(p);
        void p.finally(() => inFlight.delete(p));
    };

    async function decide(seat: Seat) {
        const { station } = seat.plan;
        const observed = observeStation(seat.session, { radarLimit: options.radarLimit ?? RADAR_CONTACT_LIMIT });
        const display = { panels: observed.panels, radar: observed.radar };
        const capabilities = observed.capabilities as unknown as Capabilities;
        const heard = channel.heard(station, clock.seconds);
        const result = await seat.brain.decide(display, capabilities, heard);
        emit('brain_request', {
            station,
            ...result.meta,
            display,
            capabilities,
            heard,
            questions: result.request.questions,
        });
        if (result.callout) {
            // said when the decision lands, as a player speaks once they have made up their mind
            const delivered = channel.say(station, result.callout, clock.seconds);
            stats[delivered ? 'callouts' : 'suppressed']++;
            emit('callout', { station, phrase: result.callout, delivered });
        }
        for (const d of result.decisions) {
            emit('decision', {
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
            if (d.source === 'fallback') {
                stats.fallbacks++;
            }
            const press = d.press;
            if (press && !stopped) {
                const record = (ok: boolean, outcome: string) => {
                    stats.commands++;
                    if (!ok) {
                        stats.refused++;
                    }
                    emit('command', { station, control: d.control, ...press, ok, result: outcome });
                };
                track(
                    seat.session.execute(press.command as never, press.args, press.value).then(
                        (done) => record(true, done),
                        (e: unknown) => record(false, (e as Error).message),
                    ),
                );
            }
        }
        stats.inputTokens += result.meta.inputTokens ?? 0;
    }

    function tick() {
        clock.poll();
        for (const seat of seats) {
            if (seat.busy || clock.seconds + 1e-9 < seat.nextDecisionAt) {
                continue;
            }
            seat.busy = true;
            seat.nextDecisionAt = clock.seconds + seat.plan.spec.decisionSeconds;
            track(
                decide(seat)
                    .catch((e: unknown) => {
                        stats.brainErrors++;
                        emit('brain_error', { station: seat.plan.station, message: (e as Error).message });
                    })
                    .finally(() => (seat.busy = false)),
            );
        }
    }

    /**
     * Plays until `shouldContinue` (given game seconds since the crew started) says stop or `stop` is
     * called, then waits for decisions and held buttons in flight and frees the seats.
     */
    async function run(shouldContinue: (seconds: number) => boolean = () => true) {
        const pollMs = options.pollMs ?? 50;
        while (!stopped && shouldContinue(clock.seconds)) {
            tick();
            await new Promise((resolve) => setTimeout(resolve, pollMs));
        }
        stopped = true;
        while (inFlight.size) {
            await Promise.allSettled([...inFlight]);
        }
        seats.forEach((s) => s.close());
    }

    return {
        run,
        stop: () => void (stopped = true),
        stats,
        get seconds() {
            return clock.seconds;
        },
    };
}
