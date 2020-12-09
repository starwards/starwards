import { SmartPilotMode, TargetedStatus, XY } from '@starwards/model';
import { NamedGameRoom } from './client';

const noop = () => void 0;

export type NumericProperty = ReturnType<typeof numericProperty>;
function numericProperty(getValue: () => number, range: [number, number], onChange = noop as (v: number) => unknown) {
    return { getValue, range, onChange: onChange };
}

export type NormalNumericProperty = {
    range: [0, 1];
    onChange: (v: number | boolean) => unknown;
} & NumericProperty;

export function normalNumericProperty(
    getValue: () => number,
    onChangeArg = noop as (v: number) => unknown
): NormalNumericProperty {
    const onChange = (v: number | boolean) => {
        if (v === true) return onChangeArg(1);
        if (v === false) return onChangeArg(0);
        return onChangeArg(v);
    };
    return { getValue, range: [0, 1], onChange };
}

export type TextProperty = ReturnType<typeof textProperty>;
function textProperty(getValue: () => string, onChange = noop as (v: boolean) => unknown) {
    return { getValue, onChange: onChange };
}

export type ShipProperties = ReturnType<typeof shipProperties>;

export function shipProperties(shipRoom: NamedGameRoom<'ship'>) {
    return {
        'smartPilot.rotation': numericProperty(
            () => shipRoom.state.smartPilot.rotation,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotRotation', { value })
        ),
        rotation: numericProperty(() => shipRoom.state.rotation, [-1, 1]),
        'smartPilot.strafe': numericProperty(
            () => shipRoom.state.smartPilot.maneuvering.y,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotStrafe', { value: value })
        ),
        'smartPilot.boost': numericProperty(
            () => shipRoom.state.smartPilot.maneuvering.x,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotBoost', { value: value })
        ),
        strafe: numericProperty(() => shipRoom.state.strafe, [-1, 1]),
        boost: numericProperty(() => shipRoom.state.boost, [-1, 1]),
        energy: numericProperty(() => shipRoom.state.energy, [0, 1000]),
        reserveSpeed: numericProperty(() => shipRoom.state.reserveSpeed, [0, shipRoom.state.maxReserveSpeed]),
        turnSpeed: numericProperty(() => shipRoom.state.turnSpeed, [-90, 90]),
        angle: numericProperty(() => shipRoom.state.angle, [0, 360]),
        'speed direction': numericProperty(() => XY.angleOf(shipRoom.state.velocity), [0, 360]),
        speed: numericProperty(() => XY.lengthOf(shipRoom.state.velocity), [0, 1000]),
        useReserveSpeed: normalNumericProperty(
            () => shipRoom.state.useReserveSpeed,
            (value) => {
                shipRoom.send('setCombatManeuvers', { value: value });
            }
        ),
        antiDrift: normalNumericProperty(
            () => shipRoom.state.antiDrift,
            (value) => {
                shipRoom.send('setAntiDrift', { value: value });
            }
        ),
        breaks: normalNumericProperty(
            () => shipRoom.state.breaks,
            (value) => {
                shipRoom.send('setBreaks', { value: value });
            }
        ),
        'chainGun.cooldown': numericProperty(() => shipRoom.state.chainGun?.cooldown || 0, [0, 1]),
        'chainGun.shellSecondsToLive': numericProperty(() => shipRoom.state.chainGun.shellSecondsToLive, [
            shipRoom.state.chainGun.minShellSecondsToLive,
            shipRoom.state.chainGun.maxShellSecondsToLive,
        ]),
        'chainGun.isFiring': textProperty(
            () => (shipRoom.state.chainGun?.isFiring ? 'FIRE' : 'NONE'),
            (v) => {
                shipRoom.send('chainGun', { isFiring: v });
            }
        ),
        target: textProperty(
            () => String(shipRoom.state.targetId),
            (v) => v && shipRoom.send('nextTarget', {})
        ),
        targeted: textProperty(() => TargetedStatus[shipRoom.state.targeted]),
        'smartPilot.rotationMode': textProperty(
            () => SmartPilotMode[shipRoom.state.smartPilot.rotationMode],
            (v) => v && shipRoom.send('toggleSmartPilotRotationMode', {})
        ),
        'smartPilot.maneuveringMode': textProperty(
            () => SmartPilotMode[shipRoom.state.smartPilot.maneuveringMode],
            (v) => v && shipRoom.send('toggleSmartPilotManeuveringMode', {})
        ),
    };
}
