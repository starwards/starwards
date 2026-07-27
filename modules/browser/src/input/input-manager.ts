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

export type InputDescription = {
    input: string;
    label: string;
    inputType: 'keyboard' | 'gamepad-button' | 'gamepad-axis';
};

const gamepadButtonNames: Record<number, string> = {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'Back',
    9: 'Start',
    10: 'LS',
    11: 'RS',
    12: 'DPad Up',
    13: 'DPad Down',
    14: 'DPad Left',
    15: 'DPad Right',
};

const gamepadAxisNames: Record<number, string> = {
    0: 'Left Stick X',
    1: 'Left Stick Y',
    2: 'Right Stick X',
    3: 'Right Stick Y',
};

function gamepadButtonName(buttonIndex: number): string {
    return gamepadButtonNames[buttonIndex] ?? `Button ${buttonIndex}`;
}

function gamepadAxisName(axisIndex: number): string {
    return gamepadAxisNames[axisIndex] ?? `Axis ${axisIndex}`;
}

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
    private descriptions: InputDescription[] = [];
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

    getInputDescriptions(): InputDescription[] {
        return [...this.descriptions];
    }

    addRangeAction(property: RangeAction, range: RangeConfig | undefined, label?: string) {
        if (range) {
            const { axis, buttons, offsetKeys } = range;
            if (buttons || offsetKeys || axis?.velocity) {
                const offSetonly = !axis;
                const callbacks = new CombinedRangeCallbacks(property, offSetonly, !!range.circular);
                if (buttons) {
                    buttons.center && this.buttons.push({ button: buttons.center, onClick: callbacks.centerOffset });
                    if (isGamepadButtonsRangeConfig(buttons)) {
                        this.buttons.push({ button: buttons.up, onClick: callbacks.upOffset(buttons.step) });
                        this.buttons.push({ button: buttons.down, onClick: callbacks.downOffset(buttons.step) });
                        if (label) {
                            this.descriptions.push({
                                input: `${gamepadButtonName(buttons.up.buttonIndex)} / ${gamepadButtonName(buttons.down.buttonIndex)}`,
                                label,
                                inputType: 'gamepad-button',
                            });
                        }
                    } else if (label) {
                        this.descriptions.push({
                            input: gamepadButtonName(buttons.center.buttonIndex),
                            label,
                            inputType: 'gamepad-button',
                        });
                    }
                }
                if (offsetKeys) {
                    this.keys.push({ key: offsetKeys.center, onClick: callbacks.centerOffset });
                    this.keys.push({ key: offsetKeys.up, onClick: callbacks.upOffset(offsetKeys.step) });
                    this.keys.push({ key: offsetKeys.down, onClick: callbacks.downOffset(offsetKeys.step) });
                    if (label) {
                        this.descriptions.push({
                            input: `${offsetKeys.up.toUpperCase()} / ${offsetKeys.down.toUpperCase()}`,
                            label,
                            inputType: 'keyboard',
                        });
                    }
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
                    if (label) {
                        this.descriptions.push({
                            input: gamepadAxisName(axis.axisIndex),
                            label,
                            inputType: 'gamepad-axis',
                        });
                    }
                }
            } else if (axis) {
                this.axes.push({ axis, ...property });
                if (label) {
                    this.descriptions.push({
                        input: gamepadAxisName(axis.axisIndex),
                        label,
                        inputType: 'gamepad-axis',
                    });
                }
            }
        }
    }

    addMomentaryClickAction(property: TriggerAction, config: GamepadButtonConfig | string | undefined, label?: string) {
        const { setValue } = property;
        if (typeof config === 'object') {
            this.buttons.push({ button: config, setValue });
            if (label) {
                this.descriptions.push({
                    input: gamepadButtonName(config.buttonIndex),
                    label,
                    inputType: 'gamepad-button',
                });
            }
        } else if (typeof config === 'string') {
            this.keys.push({ key: config, setValue });
            if (label) {
                this.descriptions.push({ input: config.toUpperCase(), label, inputType: 'keyboard' });
            }
        }
    }

    addToggleClickAction(property: ToggleAction, config: GamepadButtonConfig | string | undefined, label?: string) {
        const onClick = () => property.setValue(!property.getValue());
        this.addClickAction(onClick, config, label);
    }

    addClickAction(onClick: () => unknown, config: GamepadButtonConfig | string | undefined, label?: string) {
        if (typeof config === 'object') {
            this.buttons.push({ button: config, onClick });
            if (label) {
                this.descriptions.push({
                    input: gamepadButtonName(config.buttonIndex),
                    label,
                    inputType: 'gamepad-button',
                });
            }
        } else if (typeof config === 'string') {
            this.keys.push({ key: config, onClick });
            if (label) {
                this.descriptions.push({ input: config.toUpperCase(), label, inputType: 'keyboard' });
            }
        }
    }

    addStepsAction(property: StepAction, key: KeysStepsConfig | undefined, label?: string) {
        if (key) {
            this.keys.push({ key: key.up, onClick: () => void property.setValue(key.step) });
            this.keys.push({ key: key.down, onClick: () => void property.setValue(-key.step) });
            if (label) {
                this.descriptions.push({
                    input: `${key.up.toUpperCase()} / ${key.down.toUpperCase()}`,
                    label,
                    inputType: 'keyboard',
                });
            }
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
        private circular = false,
    ) {
        this.offsetValue = (offSetonly && property.getValue()) || 0;
    }
    private onChange() {
        this.property.setValue(this.axisValue + this.offsetValue);
    }
    /**
     * a circular range has no ends: stepping past one edge continues from the other, so a bearing
     * can be swept all the way around. Any other range stops at its edges.
     */
    private setOffset(value: number) {
        const [min, max] = this.property.range;
        if (this.circular) {
            const span = max - min;
            this.offsetValue = min + ((((value - min) % span) + span) % span);
        } else {
            this.offsetValue = capToRange(min, max, value);
        }
        this.onChange();
    }
    centerOffset = () => {
        this.offsetValue = this.midRange;
        this.onChange();
    };
    upOffset(stepSize: number) {
        return () => this.setOffset(this.offsetValue + stepSize);
    }
    downOffset(stepSize: number) {
        return () => this.setOffset(this.offsetValue - stepSize);
    }
    axis = (v: number) => {
        this.axisValue = v;
        this.onChange();
    };

    offsetVelocity(loop: EmitterLoop) {
        let velocity = 0;
        loop.onLoop((deltaSeconds) => {
            if (velocity != 0) {
                this.setOffset(this.offsetValue + velocity * deltaSeconds);
            }
        });
        return (v: number) => {
            velocity = v;
        };
    }
}
