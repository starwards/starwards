import {
    IteratorStatePropertyCommand,
    MappedPropertyCommand,
    NormalNumericStatePropertyCommand,
    NumericStateProperty,
    NumericStatePropertyCommand,
    StateProperty,
} from '../api/property-constructors';
import { SmartPilotMode, TargetedStatus } from '..';

import { XY } from '../logic';

export const rotationCommand = NumericStatePropertyCommand<'ship'>(
    'rotationCommand',
    (state, value) => {
        state.smartPilot.rotation = value;
    },
    (state) => state.smartPilot.rotation,
    [-1, 1]
);
export const strafeCommand = NumericStatePropertyCommand<'ship'>(
    'strafeCommand',
    (state, value) => {
        state.smartPilot.maneuvering.y = value;
    },
    (state) => state.smartPilot.maneuvering.y,
    [-1, 1]
);
export const boostCommand = NumericStatePropertyCommand<'ship'>(
    'boostCommand',
    (state, value) => {
        state.smartPilot.maneuvering.x = value;
    },
    (state) => state.smartPilot.maneuvering.x,
    [-1, 1]
);
export const rotation = NumericStateProperty<'ship'>((state) => state.rotation, [-1, 1]);
export const strafe = NumericStateProperty<'ship'>((state) => state.strafe, [-1, 1]);
export const boost = NumericStateProperty<'ship'>((state) => state.boost, [-1, 1]);
export const energy = NumericStateProperty<'ship'>(
    (state) => state.energy,
    (state) => [0, state.maxEnergy]
);
export const reserveSpeed = NumericStateProperty<'ship'>(
    (state) => state.reserveSpeed,
    (state) => [0, state.maxReserveSpeed]
);
export const turnSpeed = NumericStateProperty<'ship'>((state) => state.turnSpeed, [-90, 90]);
export const angle = NumericStateProperty<'ship'>((state) => state.angle, [0, 360]);
export const velocityAngle = NumericStateProperty<'ship'>((state) => XY.angleOf(state.velocity), [0, 360]);
export const speed = NumericStateProperty<'ship'>(
    (state) => XY.lengthOf(state.velocity),
    (state) => [0, state.maxMaxSpeed]
);
export const chainGunCoolDown = NumericStateProperty<'ship'>((state) => state.chainGun.cooldown, [0, 1]);

export const useReserveSpeed = NormalNumericStatePropertyCommand<'ship'>(
    'useReserveSpeed',
    (state, value) => {
        state.useReserveSpeed = value;
    },
    (state) => state.useReserveSpeed
);
export const antiDrift = NormalNumericStatePropertyCommand<'ship'>(
    'antiDrift',
    (state, value) => {
        state.antiDrift = value;
    },
    (state) => state.antiDrift
);
export const breaks = NormalNumericStatePropertyCommand<'ship'>(
    'breaks',
    (state, value) => {
        state.breaks = value;
    },
    (state) => state.breaks
);
export const chainGunIsFiring = IteratorStatePropertyCommand<'ship'>(
    'chainGunIsFiring',
    (state, value) => {
        state.chainGun.isFiring = value;
    },
    (state) => (state.chainGun.isFiring ? 'FIRE' : 'NONE')
);
export const targeted = StateProperty<string, 'ship'>((state) => TargetedStatus[state.targeted]);
export const target = IteratorStatePropertyCommand<'ship'>(
    'target',
    (state, value) => {
        state.nextTargetCommand = value;
    },
    (state) => String(state.targetId)
);
export const rotationMode = IteratorStatePropertyCommand<'ship'>(
    'rotationMode',
    (state, value) => {
        state.rotationModeCommand = value;
    },
    (state) => SmartPilotMode[state.smartPilot.rotationMode]
);
export const maneuveringMode = IteratorStatePropertyCommand<'ship'>(
    'maneuveringMode',
    (state, value) => {
        state.maneuveringModeCommand = value;
    },
    (state) => SmartPilotMode[state.smartPilot.maneuveringMode]
);
export const constants = MappedPropertyCommand<'ship'>(
    'constants',
    (state, [name, value]) => {
        state.constants.set(name, value);
    },
    (state) => state.constants
);
export const chainGunConstants = MappedPropertyCommand<'ship'>(
    'chainGunConstants',
    (state, [name, value]) => {
        state.chainGun.constants.set(name, value);
    },
    (state) => state.chainGun.constants
);
export const shellSecondsToLive = NumericStateProperty<'ship'>(
    (state) => state.chainGun.shellSecondsToLive,
    (state) => [state.chainGun.minShellSecondsToLive, state.chainGun.maxShellSecondsToLive]
);
export const shellRange = NumericStatePropertyCommand<'ship'>(
    'shellRange',
    (state, value) => {
        state.chainGun.shellRange = value;
    },
    (state) => state.chainGun.shellRange,
    [-1, 1]
);
