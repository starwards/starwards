import '@maulingmonkey/gamepad';

export type GamepadAxis = {
    gamepadIndex: number;
    axisIndex: number;
    deadzone?: [number, number];
    inverted?: boolean;
};

export type GamepadButton = {
    gamepadIndex: number;
    buttonIndex: number;
    inverted?: boolean;
};

type AxisListener = { axis: GamepadAxis; range: [number, number]; onChange: (v: number) => unknown };
type ButtonListener = { button: GamepadButton; range: [number, number]; onChange: (v: number) => unknown };

export function isInRange(from: number, to: number, value: number) {
    return value > from && value < to;
}

function lerpAxisToRange(axisValue: number, range: [number, number]) {
    const t = (axisValue + 1) / 2;
    return (1 - t) * range[0] + t * range[1];
}

function lerpButtonToRange(buttonValue: number, range: [number, number]) {
    const t = buttonValue;
    return (1 - t) * range[0] + t * range[1];
}
function isGamepadAxis(v: unknown): v is GamepadAxis {
    return v && typeof (v as GamepadAxis).axisIndex === 'number';
}
function isGamepadButton(v: unknown): v is GamepadButton {
    return v && typeof (v as GamepadButton).buttonIndex === 'number';
}

export class InputManager {
    private axes: AxisListener[] = [];
    private buttons: ButtonListener[] = [];
    private readonly onButton = (e: mmk.gamepad.GamepadButtonEvent & CustomEvent<undefined>): void => {
        for (const listener of this.buttons) {
            if (e.buttonIndex === listener.button.buttonIndex && e.gamepadIndex === listener.button.gamepadIndex) {
                let value = e.buttonValue;
                if (listener.button.inverted) {
                    value = 1 - value;
                }
                value = lerpButtonToRange(value, listener.range);
                listener.onChange(value);
            }
        }
    };
    private readonly onAxis = (e: mmk.gamepad.GamepadAxisEvent & CustomEvent<undefined>): void => {
        for (const listener of this.axes) {
            if (e.axisIndex === listener.axis.axisIndex && e.gamepadIndex === listener.axis.gamepadIndex) {
                let value = e.axisValue;
                if (listener.axis.inverted) {
                    value = -value;
                }
                if (listener.axis.deadzone && isInRange(listener.axis.deadzone[0], listener.axis.deadzone[1], value)) {
                    value = 0;
                }
                value = lerpAxisToRange(value, listener.range);
                listener.onChange(value);
            }
        }
    };

    init() {
        addEventListener('mmk-gamepad-button-value', this.onButton);
        addEventListener('mmk-gamepad-axis-value', this.onAxis);
    }

    destroy() {
        removeEventListener('mmk-gamepad-axis-value', this.onAxis);
        removeEventListener('mmk-gamepad-button-value', this.onButton);
    }

    _addAction(range: [number, number], onChange: (v: number) => unknown, input: GamepadAxis | GamepadButton) {
        if (isGamepadAxis(input)) {
            this.addAxisAction(range, onChange, input);
        } else if (isGamepadButton(input)) {
            this.addButtonAction(range, onChange, input);
        } else throw new Error(`unknown config: ${JSON.stringify(input)}`);
    }

    addAxisAction(range: [number, number], onChange: (v: number) => unknown, axis: GamepadAxis) {
        this.axes.push({ axis, onChange, range });
    }

    addButtonAction(range: [number, number], onChange: (v: number) => unknown, button: GamepadButton) {
        this.buttons.push({ button, onChange, range });
    }
}
