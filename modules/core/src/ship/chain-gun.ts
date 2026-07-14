import {
    AmmoType,
    ClusterWarheadMode,
    ProjectileModel,
    clusterWarheadModes,
    projectileModels,
} from '../space/projectile';
import { DesignState, SystemState, defectible } from './system';
import { commandable, gameField } from '../game-field';

import { SmartPilotMode } from './smart-pilot';
import { range } from '../range';
import { shipDirectionRange } from './ship-direction';
import { tweakable } from '../tweakable';

export type SelectedProjectileModel = 'None' | ProjectileModel;

// some stats are mapped from AmmoType,
// so adding a AmmoType fails compilation
export type ChaingunDesign = {
    [T in AmmoType as `use_${T}`]: boolean;
} & {
    modelName?: string;
    bulletsPerSecond: number;
    bulletSpeed: number;
    bulletDegreesDeviation: number;
    maxShellRange: number;
    minShellRange: number;
    overrideSecondsToLive: number;
    damage50: number;
    energyCost: number;
};

export class ChaingunDesignState extends DesignState implements ChaingunDesign {
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
    @gameField('boolean') use_TandemMissile = false;
    @gameField('boolean') use_ElecMissile = false;

    isAmmoEnabled(m: ProjectileModel): boolean {
        return this[`use_${m}`];
    }

    get minShellSecondsToLive(): number {
        return this.minShellRange / this.bulletSpeed;
    }
    get maxShellSecondsToLive(): number {
        return this.maxShellRange / this.bulletSpeed;
    }
}
export class ChainGun extends SystemState {
    public static isInstance = (o: unknown): o is ChainGun => {
        return (o as ChainGun)?.type === 'ChainGun';
    };

    public readonly type: string = 'ChainGun';
    override readonly isElectronics = true;
    get name() {
        return 'Chain gun';
    }

    /*!
     *The direction of the gun in relation to the ship. (in degrees, 0 is front)
     */
    @range(shipDirectionRange)
    @gameField('float32')
    angle = 0;

    @tweakable('boolean')
    @gameField('boolean')
    isFiring = false;

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

    @defectible({ normal: 0, name: 'offset' })
    @range([-90, 90])
    @gameField('float32')
    angleOffset = 0;

    @range([0, 1])
    @defectible({ normal: 1, name: 'rate of fire' })
    @gameField('float32')
    rateOfFireFactor = 1;

    @tweakable((t: ChainGun) => ({
        type: 'string enum',
        enum: ['None', ...projectileModels.filter((k) => t.design.isAmmoEnabled(k))],
    }))
    @gameField('string')
    projectile: SelectedProjectileModel = 'None';

    @tweakable((t: ChainGun) => ({
        type: 'string enum',
        enum: ['None', ...projectileModels.filter((k) => t.design.isAmmoEnabled(k))],
    }))
    @gameField('string')
    loadedProjectile: SelectedProjectileModel = 'None';

    // warhead mode stamped on cluster munitions at launch — ignored by single-warhead ammo
    @tweakable({ type: 'string enum', enum: clusterWarheadModes })
    @gameField('string')
    clusterWarhead: ClusterWarheadMode = 'Frag';

    @gameField(ChaingunDesignState)
    design = new ChaingunDesignState();

    // server only, used for commands
    @commandable()
    public changeProjectileCommand = false;

    get broken(): boolean {
        return (this.angleOffset >= 90 || this.angleOffset <= -90) && this.rateOfFireFactor <= 0;
    }
}
