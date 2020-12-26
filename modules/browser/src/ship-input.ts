export type GamepadAxisConfig = {
    gamepadIndex: number;
    axisIndex: number;
    deadzone?: [number, number];
    inverted?: boolean;
};

export type GamepadButtonConfig = {
    gamepadIndex: number;
    buttonIndex: number;
};
interface GamepadConfig {
    chainGunIsFiring?: GamepadButtonConfig;
    target?: GamepadButtonConfig;
    useReserveSpeed?: GamepadButtonConfig;
    antiDrift?: GamepadButtonConfig;
    breaks?: GamepadButtonConfig;
    rotationMode?: GamepadButtonConfig;
    maneuveringMode?: GamepadButtonConfig;
    smartPilotRotation?: GamepadAxisConfig;
    smartPilotStrafe?: GamepadAxisConfig;
    smartPilotBoost?: GamepadAxisConfig;
    shellRange?: GamepadAxisConfig;
}
export const inputConfig: GamepadConfig = {
    // buttons
    chainGunIsFiring: {
        gamepadIndex: 0,
        buttonIndex: 4,
    },
    target: {
        gamepadIndex: 0,
        buttonIndex: 2,
    },
    useReserveSpeed: {
        gamepadIndex: 0,
        buttonIndex: 6,
    },
    antiDrift: {
        gamepadIndex: 0,
        buttonIndex: 7,
    },
    breaks: {
        gamepadIndex: 0,
        buttonIndex: 5,
    },
    rotationMode: {
        gamepadIndex: 0,
        buttonIndex: 10,
    },
    maneuveringMode: {
        gamepadIndex: 0,
        buttonIndex: 11,
    },
    // axes
    smartPilotRotation: {
        gamepadIndex: 0,
        axisIndex: 0,
        deadzone: [-0.01, 0.01] as [number, number],
    },
    smartPilotStrafe: {
        gamepadIndex: 0,
        axisIndex: 2,
        deadzone: [-0.01, 0.01] as [number, number],
    },
    smartPilotBoost: {
        gamepadIndex: 0,
        axisIndex: 3,
        deadzone: [-0.01, 0.01] as [number, number],
        inverted: true,
    },
    shellRange: {
        gamepadIndex: 0,
        axisIndex: 1,
        deadzone: [-0.01, 0.01] as [number, number],
        inverted: true,
    },
};
