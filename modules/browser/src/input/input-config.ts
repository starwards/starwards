import type { RTuple2 } from '@starwards/core';

export class GamepadAxisConfig {
    constructor(
        public gamepadIndex: number,
        public axisIndex: number,
        public deadzone?: RTuple2,
        public inverted?: boolean,
        public velocity?: number,
    ) {}
}
export class GamepadButtonConfig {
    constructor(
        public gamepadIndex: number,
        public buttonIndex: number,
    ) {}
}

export class KeysStepsConfig {
    constructor(
        public up: string,
        public down: string,
        public step: number,
    ) {}
}
class GamepadButtonsCenterConfig {
    constructor(public center: GamepadButtonConfig) {}
}
class GamepadButtonsRangeConfig {
    constructor(
        public up: GamepadButtonConfig,
        public down: GamepadButtonConfig,
        public center: GamepadButtonConfig,
        public step: number,
    ) {}
}

export function isGamepadButtonsRangeConfig(
    v: GamepadButtonsRangeConfig | GamepadButtonsCenterConfig,
): v is GamepadButtonsRangeConfig {
    return !!(v as GamepadButtonsRangeConfig).step;
}
export class KeysRangeConfig {
    constructor(
        public up: string,
        public down: string,
        public center: string,
        public step: number,
    ) {}
}
export interface RangeConfig {
    axis?: GamepadAxisConfig;
    buttons?: GamepadButtonsRangeConfig | GamepadButtonsCenterConfig;
    offsetKeys?: KeysRangeConfig;
    /** the range wraps around instead of stopping at its edges — for bearings and other angles */
    circular?: boolean;
}
export const shipInputConfig = {
    // buttons
    tubeIsFiring: 'x',
    // one dedicated hotkey per tube index — toggles that tube's safety only
    tubeSafety: ['1', '2', '3', '4'],
    warpUp: 'r',
    warpDown: 'f',
    dock: 'z',
    chainGunIsFiring: new GamepadButtonConfig(0, 4),
    target: new GamepadButtonConfig(0, 2),
    clearTarget: new GamepadButtonConfig(0, 0),
    afterBurner: new GamepadButtonConfig(0, 6),
    antiDrift: new GamepadButtonConfig(0, 7),
    breaks: new GamepadButtonConfig(0, 5),
    rotationMode: new GamepadButtonConfig(0, 10),
    rotationModeKey: 'n',
    maneuveringMode: new GamepadButtonConfig(0, 11),
    maneuveringModeKey: 'm',
    // ranges
    rotationCommand: {
        axis: new GamepadAxisConfig(0, 0, [-0.1, 0.1]),
        offsetKeys: new KeysRangeConfig('e', 'q', 'e+q,q+e', 0.05),
    },
    strafeCommand: {
        axis: new GamepadAxisConfig(0, 2, [-0.1, 0.1]),
        offsetKeys: new KeysRangeConfig('d', 'a', 'a+d,d+a', 0.05),
    },
    boostCommand: {
        axis: new GamepadAxisConfig(0, 3, [-0.1, 0.1], true),
        offsetKeys: new KeysRangeConfig('w', 's', 'w+s,s+w', 0.05),
    },
    shellRange: {
        axis: new GamepadAxisConfig(0, 1, [-0.1, 0.1], true, 0.33),
        buttons: { center: new GamepadButtonConfig(0, 14) },
        offsetKeys: new KeysRangeConfig('.', ',', '/', 0.05),
    },
    resetRotatioTargetOffset: new GamepadButtonConfig(0, 14),
    // direction and arc are absolute settings, so they are stepped from wherever they currently
    // are — an analog axis would instead drive them from zero, which is what `offSetonly` avoids
    radarDirection: {
        circular: true,
        buttons: new GamepadButtonsRangeConfig(
            new GamepadButtonConfig(0, 15),
            new GamepadButtonConfig(0, 14),
            new GamepadButtonConfig(0, 11),
            5,
        ),
        offsetKeys: new KeysRangeConfig('d', 'a', 'a+d,d+a', 5),
    },
    // W narrows the beam (trading arc for reach), S widens it
    radarArc: {
        buttons: new GamepadButtonsRangeConfig(
            new GamepadButtonConfig(0, 13),
            new GamepadButtonConfig(0, 12),
            new GamepadButtonConfig(0, 10),
            5,
        ),
        offsetKeys: new KeysRangeConfig('s', 'w', 'w+s,s+w', 5),
    },
};
interface GmInputConfig {
    rotate?: KeysStepsConfig;
    toggleFreeze?: string;
    delete?: string;
}
export const gmInputConfig: GmInputConfig = {
    rotate: new KeysStepsConfig('e', 'q', 5),
    toggleFreeze: 'f',
    delete: 'delete',
};
