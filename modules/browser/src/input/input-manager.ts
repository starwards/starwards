import '@maulingmonkey/gamepad';

import {
    GamepadAxisConfig,
    GamepadButtonConfig,
    KeysStepsConfig,
    RangeConfig,
    isGamepadButtonsRangeConfig,
} from './input-config';
import { RTuple2, capToRange, isInRange } from '@starwards/core';

import { EmitterLoop } from '../loop';
import hotkeys from 'hotkeys-js';

type AxisListener = { axis: GamepadAxisConfig; range: RTuple2; setValue: (v: number) => unknown };
type ButtonListener = { button: GamepadButtonConfig; setValue?: (v: boolean) => unknown; onClick?: () => unknown };
type KeyListener = { key: string; setValue?: (v: boolean) => unknown; onClick?: () => unknown };

// equiv. to lerp([-1, 1], range, axisValue)
function lerpAxisToRange(range: RTuple2, axisValue: number) {
    const t = (axisValue + 1) / 2;
    return (1 - t) * range[0] + t * range[1];
}
interface RangeAction {
    range: RTuple2;
    getValue: () => number | undefined;
    setValue: (v: number) => unknown;
}
interface TriggerAction {
    setValue: (v: boolean) => unknown;
}
interface ToggleAction {
    getValue: () => boolean | undefined;
    setValue: (v: boolean) => unknown;
}
export function numberAction(action: { setValue: (v: number) => unknown }): TriggerAction {
    return { setValue: (v: boolean) => action.setValue(Number(v)) };
}
interface StepAction {
    setValue: (v: number) => unknown;
}
export class InputManager {
    private axes: AxisListener[] = [];
    private buttons: ButtonListener[] = [];
    private keys: KeyListener[] = [];
    private loop = new EmitterLoop(1000 / 10);
    private readonly onButton = (e: mmk.gamepad.GamepadButtonEvent & CustomEvent<undefined>): void => {
        for (const listener of this.buttons) {
            if (e.buttonIndex === listener.button.buttonIndex && e.gamepadIndex === listener.button.gamepadIndex) {
                const value = Boolean(e.buttonValue);
                if (listener.setValue) {
                    listener.setValue(value);
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
                listener.setValue(value);
            }
        }
    };

    init() {
        if (!this.loop.isStarted()) {
            addEventListener('mmk-gamepad-button-value', this.onButton);
            addEventListener('mmk-gamepad-axis-value', this.onAxis);
            for (const key of this.keys) {
                hotkeys(key.key, { keyup: true }, (e) => {
                    const value = e.type === 'keydown';
                    if (value && key.onClick) {
                        key.onClick();
                    }
                    if (key.setValue) {
                        key.setValue(value);
                    }
                });
            }
            this.loop.start();
        }
    }

    destroy() {
        if (this.loop.isStarted()) {
            this.loop.stop();
            removeEventListener('mmk-gamepad-axis-value', this.onAxis);
            removeEventListener('mmk-gamepad-button-value', this.onButton);
            for (const key of this.keys) {
                hotkeys.unbind(key.key);
            }
        }
    }

    addRangeAction(property: RangeAction, range: RangeConfig | undefined) {
        if (range) {
            const { axis, buttons, offsetKeys } = range;
            if (buttons || offsetKeys || axis?.velocity) {
                const offSetonly = !axis;
                const callbacks = new CombinedRangeCallbacks(property, offSetonly);
                if (buttons) {
                    buttons.center && this.buttons.push({ button: buttons.center, onClick: callbacks.centerOffset });
                    if (isGamepadButtonsRangeConfig(buttons)) {
                        this.buttons.push({ button: buttons.up, onClick: callbacks.upOffset(buttons.step) });
                        this.buttons.push({ button: buttons.down, onClick: callbacks.downOffset(buttons.step) });
                    }
                }
                if (offsetKeys) {
                    this.keys.push({ key: offsetKeys.center, onClick: callbacks.centerOffset });
                    this.keys.push({ key: offsetKeys.up, onClick: callbacks.upOffset(offsetKeys.step) });
                    this.keys.push({ key: offsetKeys.down, onClick: callbacks.downOffset(offsetKeys.step) });
                }
                if (axis) {
                    if (axis.velocity) {
                        this.axes.push({
                            axis,
                            range: property.range,
                            setValue: callbacks.offsetVelocity(this.loop),
                        });
                    } else {
                        this.axes.push({ axis, range: property.range, setValue: callbacks.axis });
                    }
                }
            } else if (axis) {
                this.axes.push({ axis, ...property });
            }
        }
    }

    addMomentaryClickAction(property: TriggerAction, config: GamepadButtonConfig | string | undefined) {
        const { setValue } = property;
        if (typeof config === 'object') {
            this.buttons.push({ button: config, setValue });
        } else if (typeof config === 'string') {
            this.keys.push({ key: config, setValue });
        }
    }

    addToggleClickAction(property: ToggleAction, config: GamepadButtonConfig | string | undefined) {
        const onClick = () => property.setValue(!property.getValue());
        this.addClickAction(onClick, config);
    }

    addClickAction(onClick: () => unknown, config: GamepadButtonConfig | string | undefined) {
        if (typeof config === 'object') {
            this.buttons.push({ button: config, onClick });
        } else if (typeof config === 'string') {
            this.keys.push({ key: config, onClick });
        }
    }

    addStepsAction(property: StepAction, key: KeysStepsConfig | undefined) {
        if (key) {
            this.keys.push({ key: key.up, onClick: () => void property.setValue(key.step) });
            this.keys.push({ key: key.down, onClick: () => void property.setValue(-key.step) });
        }
    }
}
class CombinedRangeCallbacks {
    private readonly midRange = lerpAxisToRange(this.property.range, 0);
    private axisValue = 0;
    private offsetValue: number;

    constructor(
        private property: RangeAction,
        offSetonly: boolean,
    ) {
        this.offsetValue = (offSetonly && property.getValue()) || 0;
    }
    private onChange() {
        this.property.setValue(this.axisValue + this.offsetValue);
    }
    centerOffset = () => {
        this.offsetValue = this.midRange;
        this.onChange();
    };
    upOffset(stepSize: number) {
        return () => {
            this.offsetValue = capToRange(this.property.range[0], this.property.range[1], this.offsetValue + stepSize);
            this.onChange();
        };
    }
    downOffset(stepSize: number) {
        return () => {
            this.offsetValue = capToRange(this.property.range[0], this.property.range[1], this.offsetValue - stepSize);
            this.onChange();
        };
    }
    axis = (v: number) => {
        this.axisValue = v;
        this.onChange();
    };

    offsetVelocity(loop: EmitterLoop) {
        let velocity = 0;
        loop.onLoop((deltaSeconds) => {
            if (velocity != 0) {
                this.offsetValue = capToRange(
                    this.property.range[0],
                    this.property.range[1],
                    this.offsetValue + velocity * deltaSeconds,
                );
                this.onChange();
            }
        });
        return (v: number) => {
            velocity = v;
        };
    }
}
