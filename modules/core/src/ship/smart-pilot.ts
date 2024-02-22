import { DesignState, SystemState, defectible } from './system';

import { Vec2 } from '../space';
import { gameField } from '../game-field';
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
    @gameField('float32') maxTargetAimOffset = 0;
    @gameField('float32') aimOffsetSpeed = 0;
    @gameField('float32') maxTurnSpeed = 0;
    @gameField('float32') offsetBrokenThreshold = 0;
    @gameField('float32') damage50 = 0;
    @gameField('float32') maxSpeed = 0;
    @gameField('float32') maxSpeedFromAfterBurner = 0;
}

export class SmartPilot extends SystemState {
    public static isInstance = (o: unknown): o is SmartPilot => {
        return (o as SmartPilot)?.type === 'SmartPilot';
    };

    public readonly type = 'SmartPilot';
    public readonly name = 'Smart pilot';

    @gameField(SmartPilotDesignState)
    design = new SmartPilotDesignState();

    @gameField('int8')
    @tweakable({ type: 'enum', enum: SmartPilotMode })
    rotationMode!: SmartPilotMode;

    @gameField('int8')
    @tweakable({ type: 'enum', enum: SmartPilotMode })
    maneuveringMode!: SmartPilotMode;

    @gameField('float32')
    @range([-1, 1])
    rotation = 0;

    @gameField('float32')
    @range([-1, 1])
    rotationTargetOffset = 0;

    @gameField(Vec2)
    @range({ '/x': [-1, 1], '/y': [-1, 1] })
    maneuvering: Vec2 = new Vec2(0, 0);

    /**
     * factor of error vector when active
     */
    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 0, name: 'offset' })
    offsetFactor = 0;

    get broken(): boolean {
        return this.offsetFactor >= this.design.offsetBrokenThreshold;
    }
}
