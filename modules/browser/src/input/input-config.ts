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

export class GamepadButtonsRangeConfig {
    constructor(
        public up: GamepadButtonConfig,
        public down: GamepadButtonConfig,
        public center: GamepadButtonConfig,
        public step: number
    ) {}
}
export class KeysRangeConfig {
    constructor(public up: string, public down: string, public center: string, public step: number) {}
}
export interface ShipInputConfig {
    chainGunIsFiring?: GamepadButtonConfig;
    target?: GamepadButtonConfig;
    useReserveSpeed?: GamepadButtonConfig;
    antiDrift?: GamepadButtonConfig;
    breaks?: GamepadButtonConfig;
    rotationMode?: GamepadButtonConfig;
    maneuveringMode?: GamepadButtonConfig;
    rotationCommand?: GamepadAxisConfig;
    strafeCommand?: GamepadAxisConfig;
    boostCommand?: GamepadAxisConfig;
    shellRange?: GamepadAxisConfig;
    shellRangeButtons?: GamepadButtonsRangeConfig;
}

export const inputConfig: ShipInputConfig = {
    // buttons
    chainGunIsFiring: new GamepadButtonConfig(0, 4),
    target: new GamepadButtonConfig(0, 2),
    useReserveSpeed: new GamepadButtonConfig(0, 6),
    antiDrift: new GamepadButtonConfig(0, 7),
    breaks: new GamepadButtonConfig(0, 5),
    rotationMode: new GamepadButtonConfig(0, 10),
    maneuveringMode: new GamepadButtonConfig(0, 11),
    // axes
    rotationCommand: new GamepadAxisConfig(0, 0, [-0.01, 0.01]),
    strafeCommand: new GamepadAxisConfig(0, 2, [-0.01, 0.01]),
    boostCommand: new GamepadAxisConfig(0, 3, [-0.01, 0.01], true),
    shellRange: new GamepadAxisConfig(0, 1, [-0.01, 0.01], true),
    // range buttons
    shellRangeButtons: new GamepadButtonsRangeConfig(
        new GamepadButtonConfig(0, 12),
        new GamepadButtonConfig(0, 13),
        new GamepadButtonConfig(0, 14),
        0.1
    ),
};
