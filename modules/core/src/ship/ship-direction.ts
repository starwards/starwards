import { XY } from '..';

export type ShipDirectionConfig = 'FWD' | 'STBD' | 'AFT' | 'PORT';

export enum ShipDirection {
    FWD = 0,
    STBD = -90,
    AFT = 180,
    PORT = 90,
}

export const ShipDirections = Object.values(ShipDirection).filter<ShipDirection>(
    (k): k is ShipDirection => typeof k === 'number'
);

export function getDirectionFromConfig(config: ShipDirectionConfig): ShipDirection {
    return ShipDirection[config];
}

export function vector2ShipDirections(xy: XY) {
    return {
        x: xy.x > 0 ? ShipDirection.FWD : ShipDirection.AFT,
        y: xy.y > 0 ? ShipDirection.PORT : ShipDirection.STBD,
    };
}
