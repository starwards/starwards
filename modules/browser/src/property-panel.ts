import '@maulingmonkey/gamepad';
import { GUI } from 'dat.gui';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { Dictionary } from 'lodash';

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

function isGamepadAxis(v: any): v is GamepadAxis {
    return v && typeof v.axisIndex === 'number';
}
function isGamepadButton(v: any): v is GamepadButton {
    return v && typeof v.buttonIndex === 'number';
}

type AxisListener = { axis: GamepadAxis; range: [number, number]; onChange: (v: number) => any };
type ButtonListener = { button: GamepadButton; range: [number, number]; onChange: (v: number) => any };

export interface Panel {
    addProperty(
        name: string,
        getValue: () => number,
        range: [number, number],
        onChange?: (v: number) => any,
        gamepad?: GamepadAxis | GamepadButton
    ): void;
}

export class PropertyPanel implements Panel {
    private rootViewModel: Dictionary<number> = {};
    private rootGui = new GUI({ autoPlace: false, hideable: false });
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

    constructor(private modelEvents: EventEmitter) {}
    init(container: Container) {
        container.getElement().append(this.rootGui.domElement);
        addEventListener('mmk-gamepad-button-value', this.onButton);
        addEventListener('mmk-gamepad-axis-value', this.onAxis);
    }
    destroy() {
        removeEventListener('mmk-gamepad-axis-value', this.onAxis);
        removeEventListener('mmk-gamepad-button-value', this.onButton);
        this.rootGui.destroy();
    }

    private contextAddProperty(
        guiFolder: GUI,
        viewModel: Dictionary<number>,
        name: string,
        getValue: () => number,
        range: [number, number],
        onChange?: (v: number) => any,
        gamepad?: GamepadAxis | GamepadButton
    ) {
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name, ...range);
        this.modelEvents.on(name, () => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        if (onChange) {
            guiController.onChange(onChange);
            if (gamepad) {
                if (isGamepadAxis(gamepad)) {
                    this.axes.push({ axis: gamepad, onChange, range });
                } else if (isGamepadButton(gamepad)) {
                    this.buttons.push({ button: gamepad, onChange, range });
                }
            }
        } else {
            guiController.onChange(() => {
                viewModel[name] = getValue();
            });
        }
    }

    addProperty(
        name: string,
        getValue: () => number,
        range: [number, number],
        onChange?: (v: number) => any,
        gamepad?: GamepadAxis | GamepadButton
    ) {
        this.contextAddProperty(this.rootGui, this.rootViewModel, name, getValue, range, onChange, gamepad);
    }

    addFolder(folderName: string): Panel {
        const guiFolder = this.rootGui.addFolder(folderName);
        guiFolder.open();
        const folderViewModel: Dictionary<number> = {};
        return {
            addProperty: (
                name: string,
                getValue: () => number,
                range: [number, number],
                onChange?: (v: number) => any,
                gamepad?: GamepadAxis | GamepadButton
            ) => this.contextAddProperty(guiFolder, folderViewModel, name, getValue, range, onChange, gamepad),
        };
    }
}
