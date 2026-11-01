import { Armor, DockingMode, GameMap, RepairPriority, repairProtocols } from '@starwards/core/internal';
import { DockOnlyParams, createTrainingDockOnlyMap } from '../../scenarios/training-dock';
import { HeadlessGame } from '../headless-game';
import { TRAINING_PLAYER_ID } from '../../scenarios/training';

/** How a dock-only run went: the pass bar is every armor plate healthy. */
export interface DockOutcome {
    readonly platesAtStart: number;
    readonly platesIntactAtStart: number;
    /** Plates restored to full health during the run (each repair counted once, even if the plate is broken again). */
    readonly platesRepaired: number;
    /** Sim-second every plate was healthy, or null. */
    readonly passedAt: number | null;
    /** Sim-seconds spent DOCKED. */
    readonly dockedSeconds: number;
    /** Exits from DOCKED (via UNDOCKING or straight to UNDOCKED). */
    readonly launches: number;
    readonly launchesPerMinute: number;
    /** Whether the crew cancelled a running armor-plate renewal for an overhaul: one was queued at the cancel, or ran before the renewal did. */
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
    let dockedStint = false;
    let intactBefore: boolean[] = [];
    let renewalCancelled = false;
    let platesRepaired = 0;
    let renewalWasRunning = false;
    let overhaulPreemptedRenewal = false;
    let lastSeconds = 0;
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
            // A launch is the arrival at UNDOCKED that ends a docked stint: a bump-out (back to DOCKED) is not one.
            if (mode === DockingMode.DOCKED) {
                dockedStint = true;
            } else if (mode === DockingMode.UNDOCKED && dockedStint) {
                dockedStint = false;
                launches++;
            }
            const slots = state.repairQueue.slots;
            const renewal = slots.find((s) => s.protocolId === 'armorPlateRenewal');
            const renewalPriority = renewal?.priority ?? RepairPriority.OFF;
            const overhauls = slots.filter((s) => (overhaulIds as readonly string[]).includes(s.protocolId));
            const plates = armor.armorPlates.map((p) => p.healthRatio >= 1);
            const repairedNow = plates.filter((intact, i) => intact && !intactBefore[i]).length;
            platesRepaired += repairedNow;
            intactBefore = plates;
            // Preempted: the crew cancelled a running renewal that had not finished (a forced stop leaves a refusal reason) and an
            // overhaul was waiting then, or took the repair crew before the renewal ran again. A renewal merely queued behind a
            // running overhaul is delay, not preemption. A cancel can finish inside one update, so an OFF slot after RUNNING is a cancel.
            if (
                renewalWasRunning &&
                renewalPriority !== RepairPriority.RUNNING &&
                !repairedNow &&
                !renewal?.refusalReason
            ) {
                renewalCancelled = true;
                overhaulPreemptedRenewal ||= overhauls.some((s) => s.priority !== RepairPriority.OFF);
            }
            if (renewalPriority === RepairPriority.RUNNING) {
                renewalCancelled = false;
            }
            overhaulPreemptedRenewal ||=
                renewalCancelled && overhauls.some((s) => s.priority === RepairPriority.RUNNING);
            renewalWasRunning = renewalPriority === RepairPriority.RUNNING;
            if (passedAt === null && plates.every(Boolean)) {
                passedAt = game.seconds;
            }
            return passedAt !== null;
        },
        outcome(game) {
            return {
                platesAtStart,
                platesIntactAtStart,
                platesRepaired,
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
                intactBefore = armor.armorPlates.map((p) => p.healthRatio >= 1);
            },
        },
        tracker,
    };
}
