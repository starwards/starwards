import { DesignState, SystemState, defectible } from './system';
import { ProjectileModel, projectileModels } from '../space/projectile';

import { SmartPilotMode } from './smart-pilot';
import { gameField } from '../game-field';
import { range } from '../range';
import { shipDirectionRange } from './ship-direction';
import { tweakable } from '../tweakable';

export type SelectedProjectileModel = 'None' | ProjectileModel;

// Properties with underline ( _ ) are templated after Projectile types, and are accessed in a generic way.
export type ChaingunDesign = {
    bulletsPerSecond: number;
    bulletSpeed: number;
    bulletDegreesDeviation: number;
    maxShellRange: number;
    minShellRange: number;
    overrideSecondsToLive: number;
    damage50: number;
    energyCost: number;
    use_CannonShell?: boolean;
    use_BlastCannonShell?: boolean;
    use_Missile?: boolean;
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
    @gameField('boolean') use_CannonShell = false;
    @gameField('boolean') use_BlastCannonShell = false;
    @gameField('boolean') use_Missile = false;

    // get explosionSecondsToLive(): number {
    //     return this.explosionRadius / this.explosionExpansionSpeed;
    // }
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
    get name() {
        return 'Chain gun';
    }

    /*!
     *The direction of the gun in relation to the ship. (in degrees, 0 is front)
     */
    @gameField('float32')
    @range(shipDirectionRange)
    angle = 0;

    @tweakable('boolean')
    @gameField('boolean')
    isFiring = false;

    @tweakable('boolean')
    @gameField('boolean')
    loadAmmo = true;

    @gameField('float32')
    @range([0, 1])
    loading = 0;

    @gameField('float32')
    @range((t: ChainGun) => [t.design.minShellSecondsToLive, t.design.maxShellSecondsToLive])
    shellSecondsToLive = 0;

    @gameField('float32')
    @range([-1, 1])
    shellRange = 0; // just used for command, not for firing

    @gameField('int8')
    shellRangeMode!: SmartPilotMode;

    @gameField('float32')
    @defectible({ normal: 0, name: 'offset' })
    @range([-90, 90])
    angleOffset = 0;

    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 1, name: 'rate of fire' })
    rateOfFireFactor = 1;

    @gameField('string')
    @tweakable((t: ChainGun) => ({
        type: 'string enum',
        enum: ['None', ...projectileModels.filter((k) => t.design[`use_${k}`])],
    }))
    projectile: SelectedProjectileModel = 'None';

    @gameField('string')
    @tweakable((t: ChainGun) => ({
        type: 'string enum',
        enum: ['None', ...projectileModels.filter((k) => t.design[`use_${k}`])],
    }))
    loadedProjectile: SelectedProjectileModel = 'None';

    @gameField(ChaingunDesignState)
    design = new ChaingunDesignState();

    // server only, used for commands
    public changeProjectileCommand = false;

    get broken(): boolean {
        return (this.angleOffset >= 90 || this.angleOffset <= -90) && this.rateOfFireFactor <= 0;
    }
}
