import '@maulingmonkey/gamepad';

import { GamepadAxisConfig, GamepadButtonConfig, GamepadButtonsRangeConfig, KeysRangeConfig } from './input-config';
import { capToRange, isInRange } from '@starwards/model/src';

import hotkeys from 'hotkeys-js';

type AxisListener = { axis: GamepadAxisConfig; range: [number, number]; onChange: (v: number) => unknown };
type ButtonListener = { button: GamepadButtonConfig; onChange?: (v: boolean) => unknown; onClick?: () => unknown };

// equiv. to lerp([-1, 1], range, axisValue)
function lerpAxisToRange(range: [number, number], axisValue: number) {
    const t = (axisValue + 1) / 2;
    return (1 - t) * range[0] + t * range[1];
}
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
                const value = Boolean(e.buttonValue);
                if (listener.onChange) {
                    listener.onChange(value);
                }
                if (value && listener.onClick) {
                    listener.onClick();
                }
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
                value = lerpAxisToRange(listener.range, value);
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
        hotkeys.unbind(); // unbind everything
    }

    addAxisAction(
        property: RangeAction,
        axis: GamepadAxisConfig | undefined,
        buttons: GamepadButtonsRangeConfig | undefined,
        keys: KeysRangeConfig | undefined
    ) {
        if (buttons || keys) {
            const callbacks = new AxisButtonsCallbacks(property);
            if (buttons) {
                this.buttons.push({ button: buttons.center, onClick: callbacks.center });
                this.buttons.push({ button: buttons.up, onClick: callbacks.up(buttons.step) });
                this.buttons.push({ button: buttons.down, onClick: callbacks.down(buttons.step) });
            }
            if (keys) {
                keys.center && hotkeys(keys.center, callbacks.center);
                keys.up && hotkeys(keys.up, callbacks.up(keys.step));
                keys.down && hotkeys(keys.down, callbacks.down(keys.step));
            }
            if (axis) {
                this.axes.push({ axis, range: property.range, onChange: callbacks.axis });
            }
        } else if (axis) {
            this.axes.push({ axis, ...property });
        }
    }

    addButtonAction(property: TriggerAction, button: GamepadButtonConfig | undefined) {
        if (button) {
            this.buttons.push({ button, ...property });
        }
    }
}

class AxisButtonsCallbacks {
    private readonly midRange = lerpAxisToRange(this.property.range, 0);
    private axisValue = this.midRange;
    private buttonsValue = this.midRange;

    constructor(private property: RangeAction) {}
    private onChange() {
        this.property.onChange(this.axisValue + this.buttonsValue);
    }
    center = () => {
        this.buttonsValue = this.midRange;
        this.onChange();
    };
    up(stepSize: number) {
        return () => {
            this.buttonsValue = capToRange(
                this.property.range[0],
                this.property.range[1],
                this.buttonsValue + stepSize
            );
            this.onChange();
        };
    }
    down(stepSize: number) {
        return () => {
            this.buttonsValue = capToRange(
                this.property.range[0],
                this.property.range[1],
                this.buttonsValue - stepSize
            );
            this.onChange();
        };
    }
    axis = (v: number) => {
        this.axisValue = v;
        this.onChange();
    };
}
