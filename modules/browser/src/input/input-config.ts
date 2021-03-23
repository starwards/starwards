export class GamepadAxisConfig {
    constructor(
        public gamepadIndex: number,
        public axisIndex: number,
        public deadzone?: [number, number],
        public inverted?: boolean
    ) {}
}

export class GamepadButtonConfig {
    constructor(public gamepadIndex: number, public buttonIndex: number) {}
}

export class KeysStepsConfig {
    constructor(public up: string, public down: string, public step: number) {}
}
export class GamepadButtonsRangeConfig {
    constructor(
        public up: GamepadButtonConfig,
        public down: GamepadButtonConfig,
        public center: GamepadButtonConfig,
        public step: number
    ) {}
}

export class KeysRangeConfig {
    constructor(
        public up: string | null,
        public down: string | null,
        public center: string | null,
        public step: number
    ) {}
}
export interface RangeConfig {
    axis?: GamepadAxisConfig;
    buttons?: GamepadButtonsRangeConfig;
    keys?: KeysRangeConfig;
}
export interface ShipInputConfig {
    chainGunIsFiring?: GamepadButtonConfig;
    target?: GamepadButtonConfig;
    clearTarget?: GamepadButtonConfig;
    afterBurner?: GamepadButtonConfig;
    antiDrift?: GamepadButtonConfig;
    breaks?: GamepadButtonConfig;
    rotationMode?: GamepadButtonConfig;
    maneuveringMode?: GamepadButtonConfig;
    // ranges
    rotationCommand?: RangeConfig;
    strafeCommand?: RangeConfig;
    boostCommand?: RangeConfig;
    shellRange?: RangeConfig;
}

export const shipInputConfig: ShipInputConfig = {
    // buttons
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
        axis: new GamepadAxisConfig(0, 0, [-0.01, 0.01]),
        keys: new KeysRangeConfig('e', 'q', 'e+q,q+e', 0.05),
    },
    strafeCommand: {
        axis: new GamepadAxisConfig(0, 2, [-0.01, 0.01]),
        keys: new KeysRangeConfig('d', 'a', 'a+d,d+a', 0.05),
    },
    boostCommand: {
        axis: new GamepadAxisConfig(0, 3, [-0.01, 0.01], true),
        keys: new KeysRangeConfig('w', 's', 'w+s,s+w', 0.05),
    },
    shellRange: {
        axis: new GamepadAxisConfig(0, 1, [-0.01, 0.01], true),
        buttons: new GamepadButtonsRangeConfig(
            new GamepadButtonConfig(0, 12),
            new GamepadButtonConfig(0, 13),
            new GamepadButtonConfig(0, 14),
            0.1
        ),
    },
};
export interface GmInputConfig {
    rotate?: KeysStepsConfig;
    toggleFreeze?: string;
}
export const gmInputConfig: GmInputConfig = {
    rotate: new KeysStepsConfig('e', 'q', 5),
    toggleFreeze: 'l',
};
