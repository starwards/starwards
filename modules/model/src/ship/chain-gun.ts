//import { ShipSystem, SmartPilotMode } from '.';
import { ShipSystem } from './ship-system';
import { SmartPilotMode } from '.';
import { getConstant } from '../utils';
import { type } from '@colyseus/schema';

export class ChainGun extends ShipSystem {
    /*!
     *The direction of the gun in relation to the ship. (in degrees, 0 is front)
     */
    @type('float32')
    angle = 0;

    @type('boolean')
    isFiring = false;

    @type('float32')
    cooldown = 0;

    @type('float32')
    shellSecondsToLive = 10;

    @type('float32')
    shellRange = 0; // just used for command, not for firing

    @type('int8')
    shellRangeMode!: SmartPilotMode;

    // TODO: move to logic (not part of state)
    get bulletSpeed(): number {
        return getConstant(this.constants, 'bulletSpeed');
    }
    get bulletsPerSecond(): number {
        return getConstant(this.constants, 'bulletsPerSecond');
    }
    get minShellRange(): number {
        return getConstant(this.constants, 'minShellRange');
    }
    get maxShellRange(): number {
        return getConstant(this.constants, 'maxShellRange');
    }
    get shellRangeAim(): number {
        return getConstant(this.constants, 'shellRangeAim');
    }
    get explosionRadius(): number {
        return getConstant(this.constants, 'explosionRadius');
    }
    get explosionExpansionSpeed(): number {
        return getConstant(this.constants, 'explosionExpansionSpeed');
    }
    get explosionDamageFactor(): number {
        return getConstant(this.constants, 'explosionDamageFactor');
    }
    get explosionBlastFactor(): number {
        return getConstant(this.constants, 'explosionBlastFactor');
    }
    get bulletDegreesDeviation(): number {
        return getConstant(this.constants, 'bulletDegreesDeviation');
    }
    get explosionSecondsToLive(): number {
        return this.explosionRadius / this.explosionExpansionSpeed;
    }
    get minShellSecondsToLive(): number {
        return this.minShellRange / this.bulletSpeed;
    }
    get maxShellSecondsToLive(): number {
        return this.maxShellRange / this.bulletSpeed;
    }
}
