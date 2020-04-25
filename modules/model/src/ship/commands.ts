import { XY } from '../space';

export interface ShipCommands {
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
