import { Schema, type } from '@colyseus/schema';

import { MapSchema } from '@colyseus/schema';
import { Vec2 } from '../space';
import { getConstant } from '../utils';

export enum SmartPilotMode {
    DIRECT,
    VELOCITY,
    TARGET,
}

export class SmartPilotState extends Schema {
    @type({ map: 'float32' })
    constants!: MapSchema<number>;

    @type('int8')
    rotationMode!: SmartPilotMode;
    @type('int8')
    maneuveringMode!: SmartPilotMode;
    @type('float32')
    rotation = 0;
    @type('float32')
    rotationTargetOffset = 0;
    @type(Vec2)
    maneuvering: Vec2 = new Vec2(0, 0);

    get maxTargetAimOffset(): number {
        return getConstant(this, 'maxTargetAimOffset');
    }

    get aimOffsetSpeed(): number {
        return getConstant(this, 'aimOffsetSpeed');
    }

    get maxTurnSpeed(): number {
        return getConstant(this, 'maxTurnSpeed');
    }

    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return getConstant(this, 'damage50');
    }
    get broken(): boolean {
        return false;
    }
}
