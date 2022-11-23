import { XY } from '../logic/xy';
import { toPositiveDegreesDelta } from '../logic';

export type ShipDirectionConfig = 'FWD' | 'STBD' | 'AFT' | 'PORT';

export const shipDirectionRange = [-180, 180] as const;
export enum ShipDirection {
    FWD = 0,
    STBD = -90,
    AFT = 180,
    PORT = 90,
}
type Eighth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ShipDirections = Object.values(ShipDirection).filter<ShipDirection>(
    (k): k is ShipDirection => typeof k === 'number'
);

export function getDirectionFromConfig(config: ShipDirectionConfig): ShipDirection {
    return ShipDirection[config];
}

export function getDirectionConfig(direction: ShipDirection): ShipDirectionConfig {
    switch (direction) {
        case ShipDirection.FWD:
            return 'FWD';
        case ShipDirection.PORT:
            return 'PORT';
        case ShipDirection.AFT:
            return 'AFT';
        case ShipDirection.STBD:
            return 'STBD';
    }
}

export function getDirectionFromAngle(angle: number): ShipDirection {
    const eighth = Math.floor(toPositiveDegreesDelta(angle) / 45) as Eighth;
    switch (eighth) {
        case 0:
        case 7:
            return ShipDirection.FWD;
        case 1:
        case 2:
            return ShipDirection.STBD;
        case 3:
        case 4:
            return ShipDirection.AFT;
        case 5:
        case 6:
            return ShipDirection.PORT;
    }
}

export function getDirectionConfigFromAngle(angle: number): ShipDirectionConfig {
    return getDirectionConfig(getDirectionFromAngle(angle));
}
export function vector2ShipDirections(xy: XY) {
    return {
        x: xy.x > 0 ? ShipDirection.FWD : ShipDirection.AFT,
        y: xy.y > 0 ? ShipDirection.PORT : ShipDirection.STBD,
    };
}
