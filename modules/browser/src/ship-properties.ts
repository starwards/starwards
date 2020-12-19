import {
    GameRoom,
    IteratorStatePropertyCommand,
    NormalNumericStateProperty,
    NumericStateProperty,
    StateProperty,
    cmdSender,
    isStatePropertyCommand,
    shipProperties as sp,
} from '@starwards/model';

const noop = () => void 0;

export type NumericProperty = {
    range: [number, number];
    onChange: (v: number) => unknown;
    getValue: () => number;
};

function wrapNumericProperty(shipRoom: GameRoom<'ship'>, p: NumericStateProperty<'ship'>): NumericProperty {
    const range = typeof p.range === 'function' ? p.range(shipRoom.state) : p.range;
    return {
        getValue: () => p.getValue(shipRoom.state),
        range,
        onChange: isStatePropertyCommand(p) ? cmdSender(shipRoom, p) : noop,
    };
}

function wrapNormalNumericProperty(
    shipRoom: GameRoom<'ship'>,
    p: NormalNumericStateProperty<'ship'>
): NormalNumericProperty {
    let onChange: (v: number | boolean) => unknown;
    if (isStatePropertyCommand(p)) {
        const sender = cmdSender(shipRoom, p);
        onChange = (v: number | boolean) => {
            if (v === true) return sender(1);
            if (v === false) return sender(0);
            return sender(v);
        };
    } else {
        onChange = noop;
    }
    return {
        getValue: () => p.getValue(shipRoom.state),
        range: [0, 1],
        onChange,
    };
}
export type NormalNumericProperty = {
    range: [0, 1];
    onChange: (v: number | boolean) => unknown;
    getValue: () => number;
};

function wrapIteratorStateProperty(
    shipRoom: GameRoom<'ship'>,
    p: IteratorStatePropertyCommand<'ship'>
): TriggerProperty {
    return {
        getValue: () => p.getValue(shipRoom.state),
        onChange: cmdSender(shipRoom, p),
    };
}
function wrapStringStateProperty(shipRoom: GameRoom<'ship'>, p: StateProperty<string, 'ship'>): TriggerProperty {
    return {
        getValue: () => p.getValue(shipRoom.state),
        onChange: isStatePropertyCommand(p) ? cmdSender(shipRoom, p) : noop,
    };
}
export type TriggerProperty = {
    getValue: () => string;
    onChange: (v: boolean) => unknown;
};

export type TextProperty = ReturnType<typeof textProperty>;
function textProperty(getValue: () => string, onChange = noop as (v: boolean) => unknown) {
    return { getValue, onChange };
}

export type ShipProperties = ReturnType<typeof shipProperties>;

export function shipProperties(shipRoom: GameRoom<'ship'>) {
    return {
        smartPilotRotation: wrapNumericProperty(shipRoom, sp.smartPilotRotation),
        shellSecondsToLive: wrapNumericProperty(shipRoom, sp.shellSecondsToLive),
        shellRange: wrapNumericProperty(shipRoom, sp.shellRange),
        rotation: wrapNumericProperty(shipRoom, sp.rotation),
        smartPilotStrafe: wrapNumericProperty(shipRoom, sp.smartPilotStrafe),
        smartPilotBoost: wrapNumericProperty(shipRoom, sp.smartPilotBoost),
        strafe: wrapNumericProperty(shipRoom, sp.strafe),
        boost: wrapNumericProperty(shipRoom, sp.boost),
        energy: wrapNumericProperty(shipRoom, sp.energy),
        reserveSpeed: wrapNumericProperty(shipRoom, sp.reserveSpeed),
        turnSpeed: wrapNumericProperty(shipRoom, sp.turnSpeed),
        angle: wrapNumericProperty(shipRoom, sp.angle),
        'speed direction': wrapNumericProperty(shipRoom, sp.velocityAngle),
        speed: wrapNumericProperty(shipRoom, sp.speed),
        chainGunCooldown: wrapNumericProperty(shipRoom, sp.chainGunCoolDown),
        chainGunShellSecondsToLive: wrapNumericProperty(shipRoom, sp.chainGunSellSecondsToLive),
        useReserveSpeed: wrapNormalNumericProperty(shipRoom, sp.useReserveSpeed),
        antiDrift: wrapNormalNumericProperty(shipRoom, sp.antiDrift),
        breaks: wrapNormalNumericProperty(shipRoom, sp.breaks),
        targeted: wrapStringStateProperty(shipRoom, sp.targeted),
        chainGunIsFiring: wrapIteratorStateProperty(shipRoom, sp.chainGunIsFiring),
        target: wrapIteratorStateProperty(shipRoom, sp.target),
        rotationMode: wrapIteratorStateProperty(shipRoom, sp.rotationMode),
        maneuveringMode: wrapIteratorStateProperty(shipRoom, sp.maneuveringMode),
    };
}
