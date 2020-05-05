import { XY } from '../space';

export interface ShipCommands {
    SetTargetTurnSpeed: {
        value: number;
    };
    SetImpulse: {
        value: number;
    };
    SetStabilizer: {
        value: number;
    };
    SetRotation: {
        value: number;
    };
    // --- physical changes
    ChangeTurnSpeed: {
        delta: number;
    };
    SetTurnSpeed: {
        value: number;
    };
    ChangeVelocity: {
        delta: XY;
    };
    SetVelocity: {
        value: XY;
    };
}

export type ShipCommand = ShipCommands[keyof ShipCommands];
