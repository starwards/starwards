import { CommandName, SmartPilotMode, State, TargetedStatus } from '..';
import {
    IteratorStatePropertyCommand,
    MappedPropertyCommand,
    NormalNumericStateProperty,
    NumericStateProperty,
    NumericStatePropertyCommand,
    StateProperty,
    XY,
} from '.';

import { MapSchema } from '@colyseus/schema';

function NormalNSPC(
    cmdName: string,
    setValue: (state: State<'ship'>, value: number) => unknown,
    getValue: (state: State<'ship'>) => number
) {
    return NSPC(cmdName, setValue, getValue, [0, 1]) as NumericStatePropertyCommand<'ship'> &
        NormalNumericStateProperty<'ship'>;
}
function NSPC(
    cmdName: string,
    setValue: (state: State<'ship'>, value: number) => unknown,
    getValue: (state: State<'ship'>) => number,
    range: [number, number] | ((state: State<'ship'>) => [number, number])
): NumericStatePropertyCommand<'ship'> {
    return { cmdName: cmdName as CommandName<'ship'>, setValue, getValue, range };
}
function NSP(
    getValue: (state: State<'ship'>) => number,
    range: [number, number] | ((state: State<'ship'>) => [number, number])
): NumericStateProperty<'ship'> {
    return { getValue, range };
}
function SSP(getValue: (state: State<'ship'>) => string): StateProperty<string, 'ship'> {
    return { getValue };
}
function TSPC(
    cmdName: string,
    setValue: (state: State<'ship'>, value: boolean) => unknown,
    getValue: (state: State<'ship'>) => string
): IteratorStatePropertyCommand<'ship'> {
    return { cmdName: cmdName as CommandName<'ship'>, setValue, getValue };
}
function ISPC(
    cmdName: string,
    setValue: (state: State<'ship'>, value: boolean) => unknown,
    getValue: (state: State<'ship'>) => string
): IteratorStatePropertyCommand<'ship'> {
    return { cmdName: cmdName as CommandName<'ship'>, setValue, getValue };
}
function MSPC(
    cmdName: string,
    setValue: (state: State<'ship'>, value: [string, number]) => unknown,
    getValue: (state: State<'ship'>) => MapSchema<number>
): MappedPropertyCommand<'ship'> {
    return { cmdName: cmdName as CommandName<'ship'>, setValue, getValue };
}

export const smartPilotRotation = NSPC(
    'setSmartPilotRotation',
    (state, value) => {
        state.smartPilot.rotation = value;
    },
    (state) => state.smartPilot.rotation,
    [-1, 1]
);
export const smartPilotStrafe = NSPC(
    'smartPilotStrafe',
    (state, value) => {
        state.smartPilot.maneuvering.y = value;
    },
    (state) => state.smartPilot.maneuvering.y,
    [-1, 1]
);
export const smartPilotBoost = NSPC(
    'smartPilotBoost',
    (state, value) => {
        state.smartPilot.maneuvering.x = value;
    },
    (state) => state.smartPilot.maneuvering.x,
    [-1, 1]
);
export const rotation = NSP((state) => state.rotation, [-1, 1]);
export const strafe = NSP((state) => state.strafe, [-1, 1]);
export const boost = NSP((state) => state.boost, [-1, 1]);
export const energy = NSP(
    (state) => state.energy,
    (state) => [0, state.maxEnergy]
);
export const reserveSpeed = NSP(
    (state) => state.reserveSpeed,
    (state) => [0, state.maxReserveSpeed]
);
export const turnSpeed = NSP((state) => state.turnSpeed, [-90, 90]);
export const angle = NSP((state) => state.angle, [0, 360]);
export const velocityAngle = NSP((state) => XY.angleOf(state.velocity), [0, 360]);
export const speed = NSP(
    (state) => XY.lengthOf(state.velocity),
    (state) => [0, state.maxMaxSpeed]
);
export const chainGunCoolDown = NSP((state) => state.chainGun.cooldown, [0, 1]);
export const chainGunSellSecondsToLive = NSP(
    (state) => state.chainGun.shellSecondsToLive,
    (state) => [state.chainGun.minShellSecondsToLive, state.chainGun.maxShellSecondsToLive]
);
export const useReserveSpeed = NormalNSPC(
    'useReserveSpeed',
    (state, value) => {
        state.useReserveSpeed = value;
    },
    (state) => state.useReserveSpeed
);
export const antiDrift = NormalNSPC(
    'antiDrift',
    (state, value) => {
        state.antiDrift = value;
    },
    (state) => state.antiDrift
);
export const breaks = NormalNSPC(
    'breaks',
    (state, value) => {
        state.breaks = value;
    },
    (state) => state.breaks
);
export const chainGunIsFiring = TSPC(
    'chainGunIsFiring',
    (state, value) => {
        state.chainGun.isFiring = value;
    },
    (state) => (state.chainGun.isFiring ? 'FIRE' : 'NONE')
);
export const targeted = SSP((state) => TargetedStatus[state.targeted]);
export const target = ISPC(
    'target',
    (state, value) => {
        state.nextTargetCommand = value;
    },
    (state) => String(state.targetId)
);
export const rotationMode = ISPC(
    'rotationMode',
    (state, value) => {
        state.rotationModeCommand = value;
    },
    (state) => SmartPilotMode[state.smartPilot.rotationMode]
);
export const maneuveringMode = ISPC(
    'maneuveringMode',
    (state, value) => {
        state.maneuveringModeCommand = value;
    },
    (state) => SmartPilotMode[state.smartPilot.maneuveringMode]
);
export const constants = MSPC(
    'constants',
    (state, [name, value]) => {
        state.constants.set(name, value);
    },
    (state) => state.constants
);
export const chainGunConstants = MSPC(
    'chainGunConstants',
    (state, [name, value]) => {
        state.chainGun.constants.set(name, value);
    },
    (state) => state.chainGun.constants
);
export const shellSecondsToLive = NSP(
    (state) => state.chainGun.shellSecondsToLive,
    (state) => [state.chainGun.minShellSecondsToLive, state.chainGun.maxShellSecondsToLive]
);
export const shellRange = NSPC(
    'shellRange',
    (state, value) => {
        state.chainGun.shellRange = value;
    },
    (state) => state.chainGun.shellRange,
    [-1, 1]
);
