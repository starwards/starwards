import { AmmoType, MagazineStock, ammoTypes, magazineStock } from '../space/projectile';
import { Turret, TurretDesign, TurretDesignState } from './turret';
import { commandable, gameField } from '../game-field';

import { SmartPilotMode } from './smart-pilot';
import { defectible } from './system';
import { GUN_HEAT, gunHeatBars } from './gun-heat';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type SelectedProjectileModel = 'None' | AmmoType;

// some stats are mapped from MagazineStock, so adding one fails compilation;
// use_ClusterMissile enables both cluster ammo types
export type ChaingunDesign = TurretDesign & {
    [T in MagazineStock as `use_${T}`]: boolean;
} & {
    modelName?: string;
    isInternal: boolean;
    isElectronics: boolean;
    bulletsPerSecond: number;
    bulletSpeed: number;
    bulletDegreesDeviation: number;
    maxShellRange: number;
    minShellRange: number;
    overrideSecondsToLive: number;
    damage50: number;
    energyCost: number;
};

export class ChaingunDesignState extends TurretDesignState implements ChaingunDesign {
    @gameField('float32') bulletsPerSecond = 0;
    @gameField('float32') bulletSpeed = 0;
    @gameField('float32') bulletDegreesDeviation = 0;
    @gameField('float32') maxShellRange = 0;
    @gameField('float32') minShellRange = 0;
    @gameField('float32') overrideSecondsToLive = -1;
    @gameField('float32') damage50 = 0;
    @gameField('float32') energyCost = 0;
    @gameField('boolean') use_HiExpShell = false;
    @gameField('boolean') use_ArmPenShell = false;
    @gameField('boolean') use_FragShell = false;
    @gameField('boolean') use_HiExpMissile = false;
    @gameField('boolean') use_ArmPenMissile = false;
    @gameField('boolean') use_FragMissile = false;
    @gameField('boolean') use_ClusterMissile = false;
    @gameField('boolean') use_ElecMissile = false;

    isAmmoEnabled(m: AmmoType): boolean {
        return this[`use_${magazineStock(m)}`];
    }

    get minShellSecondsToLive(): number {
        return this.minShellRange / this.bulletSpeed;
    }
    get maxShellSecondsToLive(): number {
        return this.maxShellRange / this.bulletSpeed;
    }
}
export class ChainGun extends Turret {
    public static isInstance = (o: unknown): o is ChainGun => {
        return (o as ChainGun)?.type === 'ChainGun';
    };

    public readonly type: string = 'ChainGun';
    get name() {
        return 'Chain gun';
    }

    @tweakable('boolean')
    @gameField('boolean')
    isFiring = false;

    /**
     * A friendly solid sits on this mount's firing line, so its next shell would detonate on it.
     * Recomputed every tick on player ships, and on NPC ships while the mount fires; NPC gunnery
     * holds fire while set, player fire is never gated.
     * @see docs/design/mechanics/line-of-fire.md
     */
    @gameField('boolean')
    lineOfFireBlocked = false;

    @tweakable('boolean')
    @gameField('boolean')
    loadAmmo = true;

    @range([0, 1])
    @gameField('float32')
    loading = 0;

    @range((t: ChainGun) => [t.design.minShellSecondsToLive, t.design.maxShellSecondsToLive])
    @gameField('float32')
    shellSecondsToLive = 0;

    @range([-1, 1])
    @commandable()
    @gameField('float32')
    shellRange = 0; // just used for command, not for firing

    @gameField('int8')
    shellRangeMode!: SmartPilotMode;

    @range([0, 1])
    @defectible({ normal: 1, name: 'rate of fire' })
    @gameField('float32')
    rateOfFireFactor = 1;

    /**
     * How worn the barrel is, 0 (pristine) to 1 (fully worn). Wear widens the base spread and lowers
     * the heat bars (see `GUN_HEAT`). Caused by overheating and by weapon hits; restored by the
     * barrel replacement repair protocol. Declared on chain guns only — a tube has no barrel.
     */
    @defectible({ normal: 0, name: 'barrel wear', enabled: (t) => (t as ChainGun).type === 'ChainGun' })
    @range([0, 1])
    @gameField('float32')
    barrelWear = 0;

    /** Seconds left on a jam. While above 0 the gun cannot fire. */
    @range([0, GUN_HEAT.jamSeconds])
    @gameField('float32')
    jammedSeconds = 0;

    /** Forced cooldown: set when heat reaches 100, cleared once heat falls to `GUN_HEAT.cooldownRelease`. The gun cannot fire meanwhile. */
    @gameField('boolean')
    cooling = false;

    /** Heat at which spread starts to grow, lowered by barrel wear. */
    get spreadBar() {
        return gunHeatBars(this.barrelWear).spreadBar;
    }

    /** Heat at which a shot may jam the gun, lowered by barrel wear. */
    get jamBar() {
        return gunHeatBars(this.barrelWear).jamBar;
    }

    @tweakable((t: ChainGun) => ({
        type: 'string enum',
        enum: ['None', ...ammoTypes.filter((k) => t.design.isAmmoEnabled(k))],
    }))
    @gameField('string')
    projectile: SelectedProjectileModel = 'None';

    @tweakable((t: ChainGun) => ({
        type: 'string enum',
        enum: ['None', ...ammoTypes.filter((k) => t.design.isAmmoEnabled(k))],
    }))
    @gameField('string')
    loadedProjectile: SelectedProjectileModel = 'None';

    @gameField(ChaingunDesignState)
    design = new ChaingunDesignState();

    // server only, used for commands
    @commandable()
    public changeProjectileCommand = false;

    get broken(): boolean {
        return super.broken || this.rateOfFireFactor <= 0;
    }
}
