export const inputConfig = {
    // buttons
    'chainGun.isFiring': {
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
    'smartPilot.rotationMode': {
        gamepadIndex: 0,
        buttonIndex: 10,
    },
    'smartPilot.maneuveringMode': {
        gamepadIndex: 0,
        buttonIndex: 11,
    },
    // axes
    'smartPilot.rotation': {
        gamepadIndex: 0,
        axisIndex: 0,
        deadzone: [-0.01, 0.01] as [number, number],
    },
    'smartPilot.strafe': {
        gamepadIndex: 0,
        axisIndex: 2,
        deadzone: [-0.01, 0.01] as [number, number],
    },
    'smartPilot.boost': {
        gamepadIndex: 0,
        axisIndex: 3,
        deadzone: [-0.01, 0.01] as [number, number],
        inverted: true,
    },
};
