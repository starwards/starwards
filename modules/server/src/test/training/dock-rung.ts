import {
    Armor,
    DockingMode,
    GameMap,
    RepairPriority,
    isRepairPriorityPending,
    repairProtocols,
} from '@starwards/core/internal';
import { DockOnlyParams, createTrainingDockOnlyMap } from '../../scenarios/training-dock';
import { HeadlessGame } from '../headless-game';
import { TRAINING_PLAYER_ID } from '../../scenarios/training';

/** How a dock-only run went: the pass bar is every armor plate healthy. */
export interface DockOutcome {
    readonly platesAtStart: number;
    readonly platesIntactAtStart: number;
    /** Intact plates (every layer at full health) at the end minus at the start. */
    readonly platesRepaired: number;
    /** Sim-second every plate was healthy, or null. */
    readonly passedAt: number | null;
    /** Sim-seconds spent DOCKED. */
    readonly dockedSeconds: number;
    /** Exits from DOCKED (via UNDOCKING or straight to UNDOCKED). */
    readonly launches: number;
    readonly launchesPerMinute: number;
    /** Whether a running armor-plate renewal was demoted (cancelling, or back to pending) while an overhaul was queued or running. */
    readonly overhaulPreemptedRenewal: boolean;
}

/** Watches a dock-only game: ends the run once every armor plate is healthy. */
export interface DockTracker {
    done(game: HeadlessGame): boolean;
    outcome(game: HeadlessGame): DockOutcome;
}

/** Plates at full health on every layer: the dock rung's "healthy", stricter than `Armor.numberOfHealthyPlates` (not broken). */
const intactPlates = (armor: Armor) => armor.armorPlates.filter((p) => p.healthRatio >= 1).length;

const overhaulIds = [
    'feedSystemOverhaul',
    'hullWideSystemsOverhaul',
] as const satisfies readonly (keyof typeof repairProtocols)[];

export function trackDock(params: DockOnlyParams, playerArmor: number): { map: GameMap; tracker: DockTracker } {
    let platesAtStart = 0;
    let platesIntactAtStart = 0;
    let passedAt: number | null = null;
    let dockedSeconds = 0;
    let launches = 0;
    let previousMode = DockingMode.UNDOCKED;
    let renewalWasRunning = false;
    let overhaulPreemptedRenewal = false;
    let lastSeconds = 0;
    const armorOf = (game: HeadlessGame) => game.api.getShip(TRAINING_PLAYER_ID)!.state.armor;
    const tracker: DockTracker = {
        done(game) {
            const state = game.api.getShip(TRAINING_PLAYER_ID)!.state;
            const armor = state.armor;
            const dt = game.seconds - lastSeconds;
            lastSeconds = game.seconds;
            const mode = state.docking.mode;
            if (mode === DockingMode.DOCKED) {
                dockedSeconds += dt;
            }
            if (previousMode === DockingMode.DOCKED && mode !== DockingMode.DOCKED) {
                launches++;
            }
            previousMode = mode;
            const slots = state.repairQueue.slots;
            const renewal = slots.find((s) => s.protocolId === 'armorPlateRenewal');
            const overhauls = slots.filter((s) => (overhaulIds as readonly string[]).includes(s.protocolId));
            const renewalPriority = renewal?.priority ?? RepairPriority.OFF;
            // Preempted: a running renewal was demoted (cancelling, or back to pending) while an overhaul was queued or running.
            const renewalDemoted =
                renewalWasRunning &&
                (renewalPriority === RepairPriority.CANCELLING || isRepairPriorityPending(renewalPriority));
            overhaulPreemptedRenewal ||= renewalDemoted && overhauls.some((s) => s.priority !== RepairPriority.OFF);
            renewalWasRunning = renewalPriority === RepairPriority.RUNNING;
            if (passedAt === null && intactPlates(armor) === armor.numberOfPlates) {
                passedAt = game.seconds;
            }
            return passedAt !== null;
        },
        outcome(game) {
            const armor = armorOf(game);
            return {
                platesAtStart,
                platesIntactAtStart,
                platesRepaired: intactPlates(armor) - platesIntactAtStart,
                passedAt,
                dockedSeconds,
                launches,
                launchesPerMinute: game.seconds > 0 ? (launches * 60) / game.seconds : 0,
                overhaulPreemptedRenewal,
            };
        },
    };
    const map = createTrainingDockOnlyMap(params, { playerArmor });
    return {
        map: {
            ...map,
            init: (game) => {
                map.init(game);
                const armor = game.getShip(TRAINING_PLAYER_ID)!.state.armor;
                platesAtStart = armor.numberOfPlates;
                platesIntactAtStart = intactPlates(armor);
            },
        },
        tracker,
    };
}
