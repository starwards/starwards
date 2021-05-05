import { XY } from '..';

export enum ShipDirection {
    FORE = 0,
    STARBOARD = -90,
    AFT = 180,
    PORT = 90,
}

export const ShipDirections = Object.values(ShipDirection).filter<ShipDirection>(
    (k): k is ShipDirection => typeof k === 'number'
);

export function vector2ShipDirections(xy: XY) {
    return {
        x: xy.x > 0 ? ShipDirection.FORE : ShipDirection.AFT,
        y: xy.y > 0 ? ShipDirection.PORT : ShipDirection.STARBOARD,
    };
}
