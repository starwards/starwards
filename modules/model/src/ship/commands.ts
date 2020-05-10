import { XY } from '../space';

export interface ShipCommands {
    SetTargetTurnSpeed: {
        value: number;
    };
    SetImpulse: {
        value: number;
    };
    SetAntiDrift: {
        value: number;
    };
    SetRotation: {
        value: number;
    };
    SetStrafe: {
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
    // changes to ship
    SetConstant: {
        name: string;
        value: number;
    };
}

export type ShipCommand = ShipCommands[keyof ShipCommands];
