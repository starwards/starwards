import { SmartPilotMode, TargetedStatus, XY } from '@starwards/model';
import { NamedGameRoom } from './client';

const noop = () => void 0;

export type NumericProperty = ReturnType<typeof numericProperty>;
function numericProperty(
    name: string,
    getValue: () => number,
    range: [number, number],
    onChange = noop as (v: number) => unknown
) {
    return { name, getValue, range, onChange: onChange };
}

export type NormalNumericProperty = {
    range: [0, 1];
    onChange: (v: number | boolean) => unknown;
} & NumericProperty;

export function normalNumericProperty(
    name: string,
    getValue: () => number,
    onChangeArg = noop as (v: number) => unknown
): NormalNumericProperty {
    const onChange = (v: number | boolean) => {
        if (v === true) return onChangeArg(1);
        if (v === false) return onChangeArg(0);
        return onChangeArg(v);
    };
    return { name, getValue, range: [0, 1], onChange };
}

export type TextProperty = ReturnType<typeof textProperty>;
function textProperty(name: string, getValue: () => string, onChange = noop as (v: boolean) => unknown) {
    return { name, getValue, onChange: onChange };
}

export type ShipProperties = ReturnType<typeof shipProperties>;

export function shipProperties(shipRoom: NamedGameRoom<'ship'>) {
    return {
        'smartPilot.rotation': numericProperty(
            'smartPilot.rotation',
            () => shipRoom.state.smartPilot.rotation,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotRotation', { value })
        ),
        rotation: numericProperty('rotation', () => shipRoom.state.rotation, [-1, 1]),
        'smartPilot.strafe': numericProperty(
            'smartPilot.strafe',
            () => shipRoom.state.smartPilot.maneuvering.y,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotStrafe', { value: value })
        ),
        'smartPilot.boost': numericProperty(
            'smartPilot.boost',
            () => shipRoom.state.smartPilot.maneuvering.x,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotBoost', { value: value })
        ),
        strafe: numericProperty('strafe', () => shipRoom.state.strafe, [-1, 1]),
        boost: numericProperty('boost', () => shipRoom.state.boost, [-1, 1]),
        energy: numericProperty('energy', () => shipRoom.state.energy, [0, 1000]),
        reserveSpeed: numericProperty('reserveSpeed', () => shipRoom.state.reserveSpeed, [
            0,
            shipRoom.state.maxReserveSpeed,
        ]),
        turnSpeed: numericProperty('turnSpeed', () => shipRoom.state.turnSpeed, [-90, 90]),
        angle: numericProperty('angle', () => shipRoom.state.angle, [0, 360]),
        'speed direction': numericProperty('speed direction', () => XY.angleOf(shipRoom.state.velocity), [0, 360]),
        speed: numericProperty('speed', () => XY.lengthOf(shipRoom.state.velocity), [0, 1000]),
        useReserveSpeed: normalNumericProperty(
            'useReserveSpeed',
            () => shipRoom.state.useReserveSpeed,
            (value) => {
                shipRoom.send('setCombatManeuvers', { value: value });
            }
        ),
        antiDrift: normalNumericProperty(
            'antiDrift',
            () => shipRoom.state.antiDrift,
            (value) => {
                shipRoom.send('setAntiDrift', { value: value });
            }
        ),
        breaks: normalNumericProperty(
            'breaks',
            () => shipRoom.state.breaks,
            (value) => {
                shipRoom.send('setBreaks', { value: value });
            }
        ),
        'chainGun.cooldown': numericProperty('chainGun.cooldown', () => shipRoom.state.chainGun?.cooldown || 0, [0, 1]),
        'chainGun.shellSecondsToLive': numericProperty(
            'chainGun.shellSecondsToLive',
            () => shipRoom.state.chainGun.shellSecondsToLive,
            [shipRoom.state.chainGun.minShellSecondsToLive, shipRoom.state.chainGun.maxShellSecondsToLive]
        ),
        'chainGun.isFiring': textProperty(
            'chainGun.isFiring',
            () => (shipRoom.state.chainGun?.isFiring ? 'FIRE' : 'NONE'),
            (v) => {
                shipRoom.send('chainGun', { isFiring: v });
            }
        ),
        target: textProperty(
            'target',
            () => String(shipRoom.state.targetId),
            (v) => v && shipRoom.send('nextTarget', {})
        ),
        targeted: textProperty('targeted', () => TargetedStatus[shipRoom.state.targeted]),
        'smartPilot.rotationMode': textProperty(
            'smartPilot.rotationMode',
            () => SmartPilotMode[shipRoom.state.smartPilot.rotationMode],
            (v) => v && shipRoom.send('toggleSmartPilotRotationMode', {})
        ),
        'smartPilot.maneuveringMode': textProperty(
            'smartPilot.maneuveringMode',
            () => SmartPilotMode[shipRoom.state.smartPilot.maneuveringMode],
            (v) => v && shipRoom.send('toggleSmartPilotManeuveringMode', {})
        ),
    };
}
