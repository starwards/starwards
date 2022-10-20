import { Schema, type } from '@colyseus/schema';

import { ModelParams } from '../model-params';
import { Vec2 } from '../space';
import { number2Digits } from '../number-field';
import { range } from '../range';

export type SmartPilotDesign = {
    maxTargetAimOffset: number;
    aimOffsetSpeed: number;
    maxTurnSpeed: number;
    offsetBrokenThreshold: number;
    damage50: number;
    maxSpeed: number;
    maxSpeedFromAfterBurner: number;
};

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

    @type(ModelParams)
    modelParams!: ModelParams<keyof SmartPilotDesign>;

    @type('int8')
    rotationMode!: SmartPilotMode;

    @type('int8')
    maneuveringMode!: SmartPilotMode;

    @number2Digits
    @range([-1, 1])
    rotation = 0;

    @number2Digits
    @range([-1, 1])
    rotationTargetOffset = 0;

    @type(Vec2)
    @range({ '/x': [-1, 1], '/y': [-1, 1] })
    maneuvering: Vec2 = new Vec2(0, 0);

    /**
     * factor of error vector when active
     */
    @number2Digits
    @range([0, 1])
    offsetFactor = 0;

    get maxTargetAimOffset(): number {
        return this.modelParams.get('maxTargetAimOffset');
    }

    get aimOffsetSpeed(): number {
        return this.modelParams.get('aimOffsetSpeed');
    }

    get maxTurnSpeed(): number {
        return this.modelParams.get('maxTurnSpeed');
    }

    get offsetBrokenThreshold(): number {
        return this.modelParams.get('offsetBrokenThreshold');
    }

    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return this.modelParams.get('damage50');
    }
    get broken(): boolean {
        return this.offsetFactor >= this.offsetBrokenThreshold;
    }
    get maxSpeed() {
        return this.modelParams.get('maxSpeed');
    }
    get maxSpeedFromAfterBurner() {
        return this.modelParams.get('maxSpeedFromAfterBurner');
    }
}
