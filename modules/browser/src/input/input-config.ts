export class GamepadAxisConfig {
    constructor(
        public gamepadIndex: number,
        public axisIndex: number,
        public deadzone?: [number, number],
        public inverted?: boolean,
        public velocity?: number
    ) {}
}
export class GamepadButtonConfig {
    constructor(public gamepadIndex: number, public buttonIndex: number) {}
}

export class KeysStepsConfig {
    constructor(public up: string, public down: string, public step: number) {}
}
class GamepadButtonsCenterConfig {
    constructor(public center: GamepadButtonConfig) {}
}
class GamepadButtonsRangeConfig {
    constructor(
        public up: GamepadButtonConfig,
        public down: GamepadButtonConfig,
        public center: GamepadButtonConfig,
        public step: number
    ) {}
}

export function isGamepadButtonsRangeConfig(
    v: GamepadButtonsRangeConfig | GamepadButtonsCenterConfig
): v is GamepadButtonsRangeConfig {
    return !!(v as GamepadButtonsRangeConfig).step;
}
export class KeysRangeConfig {
    constructor(public up: string, public down: string, public center: string, public step: number) {}
}
export interface RangeConfig {
    axis?: GamepadAxisConfig;
    buttons?: GamepadButtonsRangeConfig | GamepadButtonsCenterConfig;
    keys?: KeysRangeConfig;
}
export interface ShipInputConfig {
    tubeIsFiring?: string | GamepadButtonConfig;
    chainGunIsFiring?: string | GamepadButtonConfig;
    target?: string | GamepadButtonConfig;
    clearTarget?: string | GamepadButtonConfig;
    afterBurner?: string | GamepadButtonConfig;
    antiDrift?: string | GamepadButtonConfig;
    breaks?: string | GamepadButtonConfig;
    rotationMode?: string | GamepadButtonConfig;
    maneuveringMode?: string | GamepadButtonConfig;
    warpUp?: string | GamepadButtonConfig;
    warpDown?: string | GamepadButtonConfig;
    dock?: string | GamepadButtonConfig;
    // ranges
    rotationCommand?: RangeConfig;
    resetRotatioTargetOffset?: string | GamepadButtonConfig;
    strafeCommand?: RangeConfig;
    boostCommand?: RangeConfig;
    shellRange?: RangeConfig;
}

export const shipInputConfig = {
    // buttons
    tubeIsFiring: 'x',
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
    maneuveringMode: new GamepadButtonConfig(0, 11),
    // ranges
    rotationCommand: {
        axis: new GamepadAxisConfig(0, 0, [-0.1, 0.1]),
        keys: new KeysRangeConfig('e', 'q', 'e+q,q+e', 0.05),
    },
    strafeCommand: {
        axis: new GamepadAxisConfig(0, 2, [-0.1, 0.1]),
        keys: new KeysRangeConfig('d', 'a', 'a+d,d+a', 0.05),
    },
    boostCommand: {
        axis: new GamepadAxisConfig(0, 3, [-0.1, 0.1], true),
        keys: new KeysRangeConfig('w', 's', 'w+s,s+w', 0.05),
    },
    shellRange: {
        axis: new GamepadAxisConfig(0, 1, [-0.1, 0.1], true, 0.33),
        buttons: { center: new GamepadButtonConfig(0, 14) },
    },
    resetRotatioTargetOffset: new GamepadButtonConfig(0, 14),
};
interface GmInputConfig {
    rotate?: KeysStepsConfig;
    toggleFreeze?: string;
}
export const gmInputConfig: GmInputConfig = {
    rotate: new KeysStepsConfig('e', 'q', 5),
    toggleFreeze: 'l',
};
