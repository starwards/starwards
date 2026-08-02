import { DesignState, SystemState, defectible } from './system';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type WarpDesign = {
    modelName?: string;
    isInternal: boolean;
    isElectronics: boolean;
    damage50: number;
    maxProximity: number;
    chargeTime: number;
    dechargeTime: number;
    speedPerLevel: number;
    energyCostPerLevel: number;
    damagePerPhysicalSpeed: number;
    baseDamagePerWarpSpeedPerSecond: number;
    secondsToChangeFrequency: number;
};

export const MAX_WARP_LVL = 4;
export enum WarpFrequency {
    W770HZ,
    /** @public used cross-workspace only in modules/browser/src/gallery/scenes/warp.ts; knip's per-workspace reference resolution doesn't see it */
    W780HZ,
    /** @public used cross-workspace only in modules/browser/src/gallery/scenes/warp.ts; knip's per-workspace reference resolution doesn't see it */
    W790HZ,
    /** @public used cross-workspace only in modules/browser/src/gallery/scenes/warp.ts; knip's per-workspace reference resolution doesn't see it */
    W800HZ,
    /** @public used cross-workspace only in modules/browser/src/gallery/scenes/warp.ts; knip's per-workspace reference resolution doesn't see it */
    W810HZ,
    WARP_FREQUENCY_COUNT,
}
export class WarpDesignState extends DesignState implements WarpDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') maxProximity = 0;
    @gameField('float32') chargeTime = 0;
    @gameField('float32') dechargeTime = 0;
    @gameField('float32') speedPerLevel = 0;
    @gameField('float32') energyCostPerLevel = 0;
    @gameField('float32') damagePerPhysicalSpeed = 0;
    @gameField('float32') baseDamagePerWarpSpeedPerSecond = 0;
    @gameField('float32') secondsToChangeFrequency = 0;
}
export class Warp extends SystemState {
    public static isInstance = (o: unknown): o is Warp => {
        return (o as Warp)?.type === 'Warp';
    };

    public readonly type = 'Warp';
    public readonly name = 'Warp';

    @gameField(WarpDesignState)
    design = new WarpDesignState();

    @range([0, 1])
    @defectible({ normal: 1, name: 'velocity' })
    @gameField('float32')
    velocityFactor = 1;

    @range([0, 1])
    @defectible({ normal: 0, name: 'damage' })
    @gameField('float32')
    damageFactor = 0;

    @range([0, MAX_WARP_LVL])
    @tweakable('number')
    @gameField('float32')
    currentLevel = 0;

    @range([0, MAX_WARP_LVL])
    @tweakable('number')
    @gameField('uint8')
    desiredLevel = 0;

    @tweakable({ type: 'enum', enum: WarpFrequency })
    @gameField('int8')
    currentFrequency = WarpFrequency.W770HZ;

    @tweakable({ type: 'enum', enum: WarpFrequency })
    @gameField('int8')
    standbyFrequency = WarpFrequency.W770HZ;

    @range([0, 1])
    @gameField('float32')
    frequencyChange = 1;

    /**
     * Manual override — proximity-jam physics (`handleWarpProximityJam` in movement-manager.ts)
     * may overwrite this on the next tick. `@tweakable` admits it to the ShipRoom JSON-pointer
     * command surface, same as any other ship subsystem field, so any client connected to this
     * ship's room can write it, not just the GM tweak panel — see "Non-goal: malicious-player
     * isolation" in docs/maintainers.md.
     */
    @tweakable('boolean')
    @gameField('boolean')
    jammed = false;

    @gameField('boolean')
    changingFrequency = false;

    // server only, used for commands
    @tweakable('boolean')
    public levelUpCommand = false;
    @tweakable('boolean')
    public levelDownCommand = false;
    @tweakable('boolean')
    public changeFrequencyCommand = false;

    get damagePerWarpSpeedPerSecond() {
        return this.damageFactor * this.design.baseDamagePerWarpSpeedPerSecond;
    }

    get broken() {
        return this.damageFactor >= 1 || this.velocityFactor <= 0;
    }
}
