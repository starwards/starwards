import '@maulingmonkey/gamepad';

import { GamepadAxisConfig, GamepadButtonConfig, KeysStepsConfig, RangeConfig } from './input-config';
import { capToRange, isInRange } from '@starwards/model/src';

import hotkeys from 'hotkeys-js';

type AxisListener = { axis: GamepadAxisConfig; range: [number, number]; onChange: (v: number) => unknown };
type ButtonListener = { button: GamepadButtonConfig; onChange?: (v: boolean) => unknown; onClick?: () => unknown };
type KeyListener = { key: string; onChange?: (v: boolean) => unknown; onClick?: () => unknown };

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
export interface StepAction {
    onChange: (v: number) => unknown;
}
export class InputManager {
    private axes: AxisListener[] = [];
    private buttons: ButtonListener[] = [];
    private keys: KeyListener[] = [];
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
        for (const key of this.keys) {
            hotkeys(key.key, { keyup: true }, (e) => {
                const value = e.type === 'keydown';
                if (value && key.onClick) {
                    key.onClick();
                }
                if (key.onChange) {
                    key.onChange(value);
                }
            });
        }
    }

    destroy() {
        removeEventListener('mmk-gamepad-axis-value', this.onAxis);
        removeEventListener('mmk-gamepad-button-value', this.onButton);
        hotkeys.unbind(); // unbind everything
    }

    addRangeAction(property: RangeAction, range: RangeConfig | undefined) {
        if (range) {
            const { axis, buttons, keys } = range;
            if (buttons || keys) {
                const callbacks = new CombinedRangeCallbacks(property);
                if (buttons) {
                    const step = getStepOfRange(buttons.step, property.range);
                    this.buttons.push({ button: buttons.center, onClick: callbacks.center });
                    this.buttons.push({ button: buttons.up, onClick: callbacks.up(step) });
                    this.buttons.push({ button: buttons.down, onClick: callbacks.down(step) });
                }
                if (keys) {
                    const step = getStepOfRange(keys.step, property.range);
                    keys.center && this.keys.push({ key: keys.center, onClick: callbacks.center });
                    keys.up && this.keys.push({ key: keys.up, onClick: callbacks.up(step) });
                    keys.down && this.keys.push({ key: keys.down, onClick: callbacks.down(step) });
                }
                if (axis) {
                    this.axes.push({ axis, range: property.range, onChange: callbacks.axis });
                }
            } else if (axis) {
                this.axes.push({ axis, ...property });
            }
        }
    }

    addButtonAction(property: TriggerAction, button: GamepadButtonConfig | undefined) {
        if (button) {
            this.buttons.push({ button, ...property });
        }
    }

    addKeyAction(property: TriggerAction, key: string | undefined) {
        if (key) {
            this.keys.push({ key, onChange: property.onChange });
        }
    }

    addStepsAction(property: StepAction, key: KeysStepsConfig | undefined) {
        if (key) {
            this.keys.push({ key: key.up, onClick: () => void property.onChange(key.step) });
            this.keys.push({ key: key.down, onClick: () => void property.onChange(-key.step) });
        }
    }
}

function getStepOfRange(step: number, range: [number, number]) {
    return (step * (range[1] - range[0])) / 2;
}
class CombinedRangeCallbacks {
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
