import { XY } from '@starwards/model';
import { NamedGameRoom } from './client';

export interface ShipProperty {
    name: string;
    getValue: () => number;
    range: [number, number];
    onChange: (v: number) => unknown;
}

const noop = (_: number) => void 0;

function shipProperty(
    name: string,
    getValue: () => number,
    range: [number, number],
    onChange?: (v: number) => unknown
): ShipProperty {
    return { name, getValue, range, onChange: onChange || noop };
}

export function shipProperties(shipRoom: NamedGameRoom<'ship'>) {
    return {
        cooldown: shipProperty('cooldown', () => shipRoom.state.chainGun?.cooldown || 0, [0, 1]),
        isFiring: shipProperty(
            'isFiring',
            () => Number(shipRoom.state.chainGun?.isFiring || 0),
            [0, 1],
            (value) => {
                shipRoom.send('chainGun', { isFiring: Boolean(value) });
            }
        ),
        shellSecondsToLive: shipProperty('shellSecondsToLive', () => shipRoom.state.chainGun.shellSecondsToLive, [
            shipRoom.state.chainGun.minShellSecondsToLive,
            shipRoom.state.chainGun.maxShellSecondsToLive,
        ]),
        'smartPilot.rotation': shipProperty(
            'smartPilot.rotation',
            () => shipRoom.state.smartPilot.rotation,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotRotation', { value })
        ),
        rotation: shipProperty('rotation', () => shipRoom.state.rotation, [-1, 1]),
        'smartPilot.strafe': shipProperty(
            'smartPilot.strafe',
            () => shipRoom.state.smartPilot.maneuvering.y,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotStrafe', { value: value })
        ),
        'smartPilot.boost': shipProperty(
            'smartPilot.boost',
            () => shipRoom.state.smartPilot.maneuvering.x,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotBoost', { value: value })
        ),
        strafe: shipProperty('strafe', () => shipRoom.state.strafe, [-1, 1]),
        boost: shipProperty('boost', () => shipRoom.state.boost, [-1, 1]),
        energy: shipProperty('energy', () => shipRoom.state.energy, [0, 1000]),
        reserveSpeed: shipProperty('reserveSpeed', () => shipRoom.state.reserveSpeed, [
            0,
            shipRoom.state.maxReserveSpeed,
        ]),
        useReserveSpeed: shipProperty(
            'useReserveSpeed',
            () => shipRoom.state.useReserveSpeed,
            [0, 1],
            (value) => {
                shipRoom.send('setCombatManeuvers', { value: value });
            }
        ),
        antiDrift: shipProperty(
            'antiDrift',
            () => shipRoom.state.antiDrift,
            [0, 1],
            (value) => {
                shipRoom.send('setAntiDrift', { value: value });
            }
        ),
        breaks: shipProperty(
            'breaks',
            () => shipRoom.state.breaks,
            [0, 1],
            (value) => {
                shipRoom.send('setBreaks', { value: value });
            }
        ),
        turnSpeed: shipProperty('turnSpeed', () => shipRoom.state.turnSpeed, [-90, 90]),
        angle: shipProperty('angle', () => shipRoom.state.angle, [0, 360]),
        'speed direction': shipProperty('speed direction', () => XY.angleOf(shipRoom.state.velocity), [0, 360]),
        speed: shipProperty('speed', () => XY.lengthOf(shipRoom.state.velocity), [0, 1000]),
    };
}
