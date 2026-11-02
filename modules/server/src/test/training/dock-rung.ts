import {
    ArmorPlate,
    DockingMode,
    GameMap,
    RepairPriority,
    RepairProtocolSlot,
    repairProtocols,
} from '@starwards/core/internal';
import { DockOnlyParams, createTrainingDockOnlyMap } from '../../scenarios/training-dock';
import { HeadlessGame } from '../headless-game';
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

/** Watches a dock-only game: ends the run once every armor plate is healthy. */
export interface DockTracker {
    done(game: HeadlessGame): boolean;
    outcome(game: HeadlessGame): DockOutcome;
}

/** A plate counts as healthy above this share of its health, summed over its layers (the dock rung's pass bar). */
const HEALTHY_PLATE_RATIO = 0.9;

/** The dock rung's "healthy" plate: health above {@link HEALTHY_PLATE_RATIO}, unlike `Armor.numberOfHealthyPlates` (not broken). */
const isHealthy = (plate: ArmorPlate) => plate.healthRatio > HEALTHY_PLATE_RATIO;

const overhaulIds: readonly string[] = [
    'feedSystemOverhaul',
    'hullWideSystemsOverhaul',
] as const satisfies readonly (keyof typeof repairProtocols)[];

/** A dock-only rung's layout: the station and attacker of {@link DockOnlyParams}, and how many plates the GVTS starts with healthy. */
export type DockRungParams = DockOnlyParams & { readonly playerArmor: number };

export function trackDock(params: DockRungParams): {
    map: GameMap;
    tracker: DockTracker;
} {
    let platesAtStart = 0;
    let platesHealthyAtStart = 0;
    let passedAt: number | null = null;
    let dockedSeconds = 0;
    let launches = 0;
    let dockedStint = false;
    let leaving = false;
    let previousMode = DockingMode.UNDOCKED;
    let healthyBefore: boolean[] = [];
    let awaitingPromotion = false;
    let platesRepaired = 0;
    let renewalWasRunning = false;
    let renewalProgress = 0;
    let overhaulPreemptedRenewal = false;
    let lastSeconds = 0;
    let renewal: RepairProtocolSlot | undefined;
    const tracker: DockTracker = {
        done(game) {
            const state = game.api.getShip(TRAINING_PLAYER_ID)?.state;
            if (!state || state.healthRatio <= 0) {
                return true; // GVTS lost (mission kill): the hull can no longer be repaired
            }
            const armor = state.armor;
            const dt = game.seconds - lastSeconds;
            lastSeconds = game.seconds;
            const mode = state.docking.mode;
            if (mode === DockingMode.DOCKED) {
                dockedSeconds += dt;
            }
            // A launch is the arrival at UNDOCKED from UNDOCKING after a docked stint: a bump-out (DOCKING again) or a
            // drift past the docking distance is not one.
            if (mode === DockingMode.DOCKED) {
                dockedStint = true;
                leaving = false;
            } else if (mode === DockingMode.UNDOCKING) {
                leaving = dockedStint;
            } else if (mode === DockingMode.UNDOCKED) {
                if (leaving || previousMode === DockingMode.DOCKED) {
                    launches++;
                }
                dockedStint = false;
                leaving = false;
            } else {
                leaving = false;
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
                    overhaulPreemptedRenewal ||= overhaulIds.includes(promoted.protocolId);
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
                platesAtStart,
                platesHealthyAtStart,
                platesRepaired,
                passedAt,
                dockedSeconds,
                launches,
                launchesPerMinute: game.seconds > 0 ? (launches * 60) / game.seconds : 0,
                overhaulPreemptedRenewal,
            };
        },
    };
    const map = createTrainingDockOnlyMap(params, { playerArmor: params.playerArmor });
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
