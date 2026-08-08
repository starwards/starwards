import { AmmoType, ammoTypes } from '../space/projectile';

import { IterationData } from '../updateable';
import { Magazine } from './magazine';
import { ShipState } from './ship-state';

/**
 * Restocks the magazine while docked (issue #2077): each ammo type accrues toward its
 * (capacity-scaled) max at `max_<type> / restockDurationSeconds` rounds/sec. Fractional progress
 * is kept here rather than on synced state — it's not player-facing, only the whole rounds this
 * deposits into `Magazine.count_<type>` are.
 *
 * Undocking mid-restock simply stops accrual — every round already loaded stays loaded. This
 * deliberately differs from `RepairManager.cancelIfTierLost`, which cancels a docked-tier repair
 * operation outright the instant the ship loses that tier: restock is logistics, not surgery.
 *
 * Constructed and ticked from the base `ShipManager` (not `ShipManagerPc` only) so player and NPC
 * ships restock alike, per the issue's "do not special-case isPlayerShip".
 */
export class AmmoManager {
    private readonly progress = new Map<AmmoType, number>();

    constructor(private state: ShipState) {}

    update({ deltaSeconds }: IterationData) {
        if (!this.state.docking.isDocked) {
            return;
        }
        const magazine = this.state.magazine;
        for (const at of ammoTypes) {
            this.accrue(magazine, at, deltaSeconds);
        }
    }

    private accrue(magazine: Magazine, at: AmmoType, deltaSeconds: number) {
        const max = magazine.getMax(at);
        const count = magazine.getCount(at);
        if (count >= max) {
            this.progress.set(at, 0);
            return;
        }
        const progress = (this.progress.get(at) ?? 0) + (max / magazine.restockDurationSeconds) * deltaSeconds;
        const wholeRounds = Math.floor(progress);
        if (wholeRounds > 0) {
            magazine.setCount(at, Math.min(max, count + wholeRounds));
        }
        this.progress.set(at, progress - wholeRounds);
    }
}

/**
 * Whether `AmmoManager` is currently (or about to start, this tick) accruing rounds for this ship
 * — same gate `AmmoManager.update` applies, exposed for UI so a client-visible "restocking" state
 * can never drift from the server's actual accrual condition.
 */
export function isRestockingAmmo(state: ShipState): boolean {
    return state.docking.isDocked && ammoTypes.some((at) => state.magazine.getCount(at) < state.magazine.getMax(at));
}
