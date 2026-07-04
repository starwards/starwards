import { DesignState, SystemState, defectible } from './system';
import { commandable, gameField } from '../game-field';

import { Vec2 } from '../space';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type SmartPilotDesign = {
    modelName?: string;
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
    override readonly isInternal = true;
    override readonly isElectronics = true;
    public readonly name = 'Smart pilot';

    @gameField(SmartPilotDesignState)
    design = new SmartPilotDesignState();

    @tweakable({ type: 'enum', enum: SmartPilotMode })
    @gameField('int8')
    rotationMode = SmartPilotMode.DIRECT;

    @tweakable({ type: 'enum', enum: SmartPilotMode })
    @gameField('int8')
    maneuveringMode = SmartPilotMode.DIRECT;

    @range([-1, 1])
    @commandable()
    @gameField('float32')
    rotation = 0;

    @range([-1, 1])
    @commandable()
    @gameField('float32')
    rotationTargetOffset = 0;

    @commandable({ '/x': true, '/y': true })
    @range({ '/x': [-1, 1], '/y': [-1, 1] })
    @gameField(Vec2)
    maneuvering: Vec2 = new Vec2(0, 0);

    /**
     * factor of error vector when active
     */
    @range([0, 1])
    @defectible({ normal: 0, name: 'offset' })
    @gameField('float32')
    offsetFactor = 0;

    get broken(): boolean {
        return this.offsetFactor >= this.design.offsetBrokenThreshold;
    }
}
