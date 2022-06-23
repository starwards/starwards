import { Schema, type } from '@colyseus/schema';

import { MapSchema } from '@colyseus/schema';
import { Vec2 } from '../space';
import { getConstant } from '../utils';

export enum SmartPilotMode {
    DIRECT,
    VELOCITY,
    TARGET,
}

export class SmartPilot extends Schema {
    public static isInstance = (o: unknown): o is SmartPilot => {
        return (o as SmartPilot)?.type === 'SmartPilot';
    };

    public readonly type = 'SmartPilot';

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

    /**
     * factor of error vector when active - (0-1)
     */
    @type('float32')
    offsetFactor = 0;

    get maxTargetAimOffset(): number {
        return getConstant(this, 'maxTargetAimOffset');
    }

    get aimOffsetSpeed(): number {
        return getConstant(this, 'aimOffsetSpeed');
    }

    get maxTurnSpeed(): number {
        return getConstant(this, 'maxTurnSpeed');
    }

    get offsetBrokenThreshold(): number {
        return getConstant(this, 'offsetBrokenThreshold');
    }

    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return getConstant(this, 'damage50');
    }
    get broken(): boolean {
        return this.offsetFactor >= this.offsetBrokenThreshold;
    }
    get maxSpeed() {
        return getConstant(this, 'maxSpeed');
    }
}
