import { Faction, SmartPilotMode, TargetedStatus } from '..';
import {
    IteratorStatePropertyCommand,
    MappedPropertyCommand,
    NormalNumericStatePropertyCommand,
    NumericStateProperty,
    NumericStatePropertyCommand,
    StateProperty,
    StatePropertyCommand,
} from '../api/property-constructors';

import { ShipState } from './ship-state';
import { SystemCondition } from '.';
import { XY } from '../logic';

export const rotationCommand = NumericStatePropertyCommand(
    'rotationCommand',
    (state: ShipState, value) => {
        state.smartPilot.rotation = value;
    },
    (state: ShipState) => state.smartPilot.rotation,
    [-1, 1]
);
export const rotationTargetOffset = NormalNumericStatePropertyCommand(
    'rotationTargetOffset',
    (state: ShipState, value) => {
        state.smartPilot.rotationTargetOffset = value;
    },
    (state: ShipState) => state.smartPilot.rotationTargetOffset
);
export const strafeCommand = NumericStatePropertyCommand(
    'strafeCommand',
    (state: ShipState, value) => {
        state.smartPilot.maneuvering.y = value;
    },
    (state: ShipState) => state.smartPilot.maneuvering.y,
    [-1, 1]
);
export const boostCommand = NumericStatePropertyCommand(
    'boostCommand',
    (state: ShipState, value) => {
        state.smartPilot.maneuvering.x = value;
    },
    (state: ShipState) => state.smartPilot.maneuvering.x,
    [-1, 1]
);
export const rotation = NumericStateProperty((state: ShipState) => state.rotation, [-1, 1]);
export const strafe = NumericStateProperty((state: ShipState) => state.strafe, [-1, 1]);
export const boost = NumericStateProperty((state: ShipState) => state.boost, [-1, 1]);
export const energy = NumericStateProperty(
    (state: ShipState) => state.energy,
    (state: ShipState) => [0, state.maxEnergy]
);
export const afterBurnerFuel = NumericStateProperty(
    (state: ShipState) => state.afterBurnerFuel,
    (state: ShipState) => [0, state.maxAfterBurner]
);
export const turnSpeed = NumericStateProperty((state: ShipState) => state.turnSpeed, [-90, 90]);
export const angle = NumericStateProperty((state: ShipState) => state.angle, [0, 360]);
export const velocityAngle = NumericStateProperty((state: ShipState) => XY.angleOf(state.velocity), [0, 360]);
export const speed = NumericStateProperty(
    (state: ShipState) => XY.lengthOf(state.velocity),
    (state: ShipState) => [0, state.maxMaxSpeed]
);
export const chainGunCoolDown = NumericStateProperty((state: ShipState) => state.chainGun.cooldown, [0, 1]);

export const afterBurner = NormalNumericStatePropertyCommand(
    'afterBurner',
    (state: ShipState, value) => {
        state.afterBurnerCommand = value;
    },
    (state: ShipState) => state.afterBurner
);
export const antiDrift = NormalNumericStatePropertyCommand(
    'antiDrift',
    (state: ShipState, value) => {
        state.antiDrift = value;
    },
    (state: ShipState) => state.antiDrift
);
export const breaks = NormalNumericStatePropertyCommand(
    'breaks',
    (state: ShipState, value) => {
        state.breaks = value;
    },
    (state: ShipState) => state.breaks
);
export const chainGunIsFiring = IteratorStatePropertyCommand(
    'chainGunIsFiring',
    (state: ShipState, value) => {
        state.chainGun.isFiring = value;
    },
    (state: ShipState) => (state.chainGun.isFiring ? 'FIRE' : 'NONE')
);
export const targeted = StateProperty((state: ShipState) => TargetedStatus[state.targeted]);
export const target = IteratorStatePropertyCommand(
    'target',
    (state: ShipState, value) => {
        state.nextTargetCommand = value;
    },
    (state: ShipState) => String(state.targetId)
);
export const clearTarget = IteratorStatePropertyCommand(
    'clearTarget',
    (state: ShipState, value) => {
        state.clearTargetCommand = value;
    },
    (state: ShipState) => String(state.targetId)
);
export const rotationMode = IteratorStatePropertyCommand(
    'rotationMode',
    (state: ShipState, value) => {
        state.rotationModeCommand = value;
    },
    (state: ShipState) => SmartPilotMode[state.smartPilot.rotationMode]
);
export const maneuveringMode = IteratorStatePropertyCommand(
    'maneuveringMode',
    (state: ShipState, value) => {
        state.maneuveringModeCommand = value;
    },
    (state: ShipState) => SmartPilotMode[state.smartPilot.maneuveringMode]
);
export const constants = MappedPropertyCommand(
    'constants',
    (state: ShipState, [name, value]) => {
        state.constants.set(name, value);
    },
    (state: ShipState) => state.constants
);
export const chainGunConstants = MappedPropertyCommand(
    'chainGunConstants',
    (state: ShipState, [name, value]) => {
        state.chainGun.constants.set(name, value);
    },
    (state: ShipState) => state.chainGun.constants
);
export const shellSecondsToLive = NumericStateProperty(
    (state: ShipState) => state.chainGun.shellSecondsToLive,
    (state: ShipState) => [state.chainGun.minShellSecondsToLive, state.chainGun.maxShellSecondsToLive]
);
export const shellRange = NumericStatePropertyCommand(
    'shellRange',
    (state: ShipState, value) => {
        state.chainGun.shellRange = value;
    },
    (state: ShipState) => state.chainGun.shellRange,
    [-1, 1]
);

export const numThrusters = NumericStateProperty((state: ShipState) => state.thrusters.length, [0, 64]);
export const thrusterAngle = StateProperty((state: ShipState, idx: number) => state.thrusters[idx].angle);
export const thrusterBroken = StatePropertyCommand(
    'thrusterBroken',
    (state: ShipState, value: boolean, idx: number) => {
        state.thrusters[idx].condition = value ? SystemCondition.BROKEN : SystemCondition.OK;
    },
    (state: ShipState, idx: number) => state.thrusters[idx].condition === SystemCondition.BROKEN
);
export const faction = StatePropertyCommand(
    'faction',
    (state: ShipState, value: Faction) => {
        state.faction = value;
    },
    (state: ShipState) => state.faction
);
