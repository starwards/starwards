import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { Vec2 } from '../space';
import { defectible } from './system';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

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

export class SmartPilotDesignState extends DesignState implements SmartPilotDesign {
    @number2Digits maxTargetAimOffset = 0;
    @number2Digits aimOffsetSpeed = 0;
    @number2Digits maxTurnSpeed = 0;
    @number2Digits offsetBrokenThreshold = 0;
    @number2Digits damage50 = 0;
    @number2Digits maxSpeed = 0;
    @number2Digits maxSpeedFromAfterBurner = 0;
}

export class SmartPilot extends Schema {
    public static isInstance = (o: unknown): o is SmartPilot => {
        return (o as SmartPilot)?.type === 'SmartPilot';
    };

    public readonly type = 'SmartPilot';
    public readonly name = 'Smart pilot';

    @type(SmartPilotDesignState)
    design = new SmartPilotDesignState();

    @type('int8')
    @tweakable({ type: 'enum', enum: SmartPilotMode })
    rotationMode!: SmartPilotMode;

    @type('int8')
    @tweakable({ type: 'enum', enum: SmartPilotMode })
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
    @defectible({ normal: 0, name: 'offset' })
    offsetFactor = 0;

    get broken(): boolean {
        return this.offsetFactor >= this.design.offsetBrokenThreshold;
    }
}
