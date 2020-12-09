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
};

type AxisListener = { axis: GamepadAxis; range: [number, number]; onChange: (v: number) => unknown };
type ButtonListener = { button: GamepadButton; onChange: (v: boolean) => unknown };

export function isInRange(from: number, to: number, value: number) {
    return value > from && value < to;
}

function lerpAxisToRange(axisValue: number, range: [number, number]) {
    const t = (axisValue + 1) / 2;
    return (1 - t) * range[0] + t * range[1];
}

// function isGamepadAxis(v: unknown): v is GamepadAxis {
//     return v && typeof (v as GamepadAxis).axisIndex === 'number';
// }
// function isGamepadButton(v: unknown): v is GamepadButton {
//     return v && typeof (v as GamepadButton).buttonIndex === 'number';
// }
export interface RangeAction {
    range: [number, number];
    onChange: (v: number) => unknown;
}
export interface TriggerAction {
    onChange: (v: boolean) => unknown;
}
export class InputManager {
    private axes: AxisListener[] = [];
    private buttons: ButtonListener[] = [];
    private readonly onButton = (e: mmk.gamepad.GamepadButtonEvent & CustomEvent<undefined>): void => {
        for (const listener of this.buttons) {
            if (e.buttonIndex === listener.button.buttonIndex && e.gamepadIndex === listener.button.gamepadIndex) {
                listener.onChange(Boolean(e.buttonValue));
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

    addAxisAction(property: RangeAction, axis: GamepadAxis) {
        this.axes.push({ axis, ...property });
    }

    addButtonAction(property: TriggerAction, button: GamepadButton) {
        this.buttons.push({ button, ...property });
    }
}
