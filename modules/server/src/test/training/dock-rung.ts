import {
    ArmorPlate,
    DockingMode,
    GameMap,
    RepairPriority,
    RepairProtocolName,
    RepairProtocolSlot,
    repairProtocols,
} from '@starwards/core/internal';
import type { RungTracker } from './wave-rung';
import { TRAINING_PLAYER_ID } from '../../scenarios/training';

/** How a dock-only run went: the pass bar is every armor plate healthy. */
export interface DockOutcome {
    readonly platesAtStart: number;
    readonly platesHealthyAtStart: number;
    /** Plates restored to healthy during the run (each repair counted once, even if the plate is hit again). */
    readonly platesRepaired: number;
    /** Sim-second every plate was healthy, or null. */
    readonly passedAt: number | null;
    /** Sim-seconds spent DOCKED. */
    readonly dockedSeconds: number;
    /** Exits from DOCKED (via UNDOCKING or straight to UNDOCKED). */
    readonly launches: number;
    readonly launchesPerMinute: number;
    /** Whether the crew cancelled a running armor-plate renewal and an overhaul was the slot promoted next. */
    readonly overhaulPreemptedRenewal: boolean;
}

/** Aggregates of dock outcomes, split by whether the run passed. */
export function dockAggregates(docks: readonly DockOutcome[]) {
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const split = (group: readonly DockOutcome[]) => ({
        runs: group.length,
        platesRepaired: mean(group.map((d) => d.platesRepaired)),
        dockedSeconds: mean(group.map((d) => d.dockedSeconds)),
        launchesPerMinute: mean(group.map((d) => d.launchesPerMinute)),
        overhaulPreemptedRenewal: group.filter((d) => d.overhaulPreemptedRenewal).length,
    });
    return {
        all: split(docks),
        passed: split(docks.filter((d) => d.passedAt !== null)),
        failed: split(docks.filter((d) => d.passedAt === null)),
    };
}

/** A plate counts as healthy above this share of its health, summed over its layers (the dock rung's pass bar). */
const HEALTHY_PLATE_RATIO = 0.9;

/** The dock rung's "healthy" plate: health above {@link HEALTHY_PLATE_RATIO}, unlike `Armor.numberOfHealthyPlates` (not broken). */
const isHealthy = (plate: ArmorPlate) => plate.healthRatio > HEALTHY_PLATE_RATIO;

/** The catalog's overhaul protocols: the ones a crew may promote over an armor-plate renewal. */
const overhaulIds = (Object.keys(repairProtocols) as RepairProtocolName[]).filter((id) =>
    /overhaul/i.test(repairProtocols[id].name),
);

export function trackDock(map: GameMap): {
    map: GameMap;
    tracker: RungTracker<{ dock: DockOutcome }>;
} {
    let platesAtStart = 0;
    let platesHealthyAtStart = 0;
    let passedAt: number | null = null;
    let dockedSeconds = 0;
    let launches = 0;
    let undocking = false;
    let previousMode = DockingMode.UNDOCKED;
    let healthyBefore: boolean[] = [];
    let awaitingPromotion = false;
    let platesRepaired = 0;
    let renewalWasRunning = false;
    let renewalProgress = 0;
    let overhaulPreemptedRenewal = false;
    let lastSeconds = 0;
    let renewal: RepairProtocolSlot | undefined;
    const tracker: RungTracker<{ dock: DockOutcome }> = {
        done(game) {
            const state = game.api.getShip(TRAINING_PLAYER_ID)!.state; // the GVTS is non-expendable
            const armor = state.armor;
            const dt = game.seconds - lastSeconds;
            lastSeconds = game.seconds;
            const mode = state.docking.mode;
            // The mode sampled last tick held at the start of this interval, so a dock and an undock each cost one tick evenly.
            if (previousMode === DockingMode.DOCKED) {
                dockedSeconds += dt;
            }
            // A launch is the arrival at UNDOCKED from DOCKED, or after UNDOCKING began (even if a re-dock was started and
            // aborted on the way out). A bump-out that drifts away (DOCKED, DOCKING, UNDOCKED) never began UNDOCKING.
            if (mode === DockingMode.DOCKED) {
                undocking = false;
            } else if (mode === DockingMode.UNDOCKING) {
                undocking = true;
            } else if (mode === DockingMode.UNDOCKED) {
                launches += Number(undocking || previousMode === DockingMode.DOCKED);
                undocking = false;
            }
            previousMode = mode;
            const slots = state.repairQueue.slots;
            if (!renewal || !slots.includes(renewal)) {
                renewal = slots.find((s) => s.protocolId === 'armorPlateRenewal');
            }
            const renewalPriority = renewal?.priority ?? RepairPriority.OFF;
            let repairedNow = 0;
            armor.armorPlates.forEach((plate, i) => {
                const healthy = isHealthy(plate);
                repairedNow += Number(healthy && !healthyBefore[i]);
                healthyBefore[i] = healthy;
            });
            platesRepaired += repairedNow;
            // The crew cancelled a running renewal: it left RUNNING without finishing (a run within two ticks of its end is a
            // completion, even if a hit un-heals its plate) and without a forced-stop refusal. A cancel can finish inside one update.
            const couldHaveFinished = renewalProgress + (2 * dt) / armor.plateRepairSeconds >= 1;
            if (
                renewalWasRunning &&
                renewalPriority !== RepairPriority.RUNNING &&
                !repairedNow &&
                !couldHaveFinished &&
                !renewal?.refusalReason
            ) {
                awaitingPromotion = true;
            }
            // Preempted: the slot promoted after that cancel is an overhaul. A renewal queued behind a running overhaul is delay.
            if (renewalPriority === RepairPriority.RUNNING) {
                awaitingPromotion = false;
            } else if (awaitingPromotion) {
                const promoted = slots.find((s) => s.priority === RepairPriority.RUNNING);
                if (promoted) {
                    overhaulPreemptedRenewal ||= overhaulIds.includes(promoted.protocolId as RepairProtocolName);
                    awaitingPromotion = false;
                } else if (slots.every((s) => s.priority === RepairPriority.OFF)) {
                    awaitingPromotion = false; // the queue went idle: a later overhaul is not what replaced the renewal
                }
            }
            renewalWasRunning = renewalPriority === RepairPriority.RUNNING;
            renewalProgress = renewalWasRunning ? (renewal?.progress ?? 0) : 0;
            if (passedAt === null && healthyBefore.every(Boolean)) {
                passedAt = game.seconds;
            }
            return passedAt !== null;
        },
        outcome(game) {
            return {
                dock: {
                    platesAtStart,
                    platesHealthyAtStart,
                    platesRepaired,
                    passedAt,
                    dockedSeconds,
                    launches,
                    launchesPerMinute: game.seconds > 0 ? (launches * 60) / game.seconds : 0,
                    overhaulPreemptedRenewal,
                },
            };
        },
    };
    return {
        map: {
            ...map,
            init: (game) => {
                map.init(game);
                const armor = game.getShip(TRAINING_PLAYER_ID)!.state.armor;
                platesAtStart = armor.numberOfPlates;
                healthyBefore = armor.armorPlates.map(isHealthy);
                platesHealthyAtStart = healthyBefore.filter(Boolean).length;
            },
        },
        tracker,
    };
}
