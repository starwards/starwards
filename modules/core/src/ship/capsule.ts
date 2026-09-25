import { DesignState, SystemState } from './system';

import { gameField } from '../game-field';
import { range } from '../range';

/**
 * Integrity each defect removes from the capsule, so a capsule survives `1 / CAPSULE_DEFECT_STEP`
 * defects. How fast defects land is the hull's `damage50`; this only fixes the count.
 */
export const CAPSULE_DEFECT_STEP = 0.1;

export type CapsuleDesign = {
    isInternal: boolean;
    isElectronics: boolean;
    damage50: number;
};

export class CapsuleDesignState extends DesignState implements CapsuleDesign {
    @gameField('float32') damage50 = 0;
}

/**
 * The ship's core: an internal hit-point counter with no other function. When it breaks the ship
 * is lost (an expendable ship becomes a Derelict), so only internal damage kills.
 *
 * Deliberately outside `ShipState.systems()`: it is not counted in `systemKillRatio`, not listed
 * with the ship's systems, and has no defectible field, so no repair protocol can restore it.
 * Attack resolution reaches it from either hit area (see `AttackResolutionManager`).
 */
export class Capsule extends SystemState {
    public static isInstance = (o: unknown): o is Capsule => {
        return (o as Capsule)?.type === 'Capsule';
    };

    public readonly type = 'Capsule';
    public readonly name = 'Capsule';

    @gameField(CapsuleDesignState)
    design = new CapsuleDesignState();

    /** Remaining integrity, 1 intact to 0 breached. */
    @range([0, 1])
    @gameField('float32')
    integrity = 1;

    get broken(): boolean {
        return this.integrity <= 0;
    }
}
