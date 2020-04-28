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

export type GamePadAxis = {
    gamepadIndex: number;
    axisIndex: number;
    deadzone: [number, number];
};

type AxisListener = { axis: GamePadAxis; range: [number, number]; onChange: (v: number) => any };

export class PropertyPanel {
    private viewModel: Dictionary<number> = {};
    private gui = new GUI({ autoPlace: false, hideable: false });
    private axes: AxisListener[] = [];
    constructor(private modelEvents: EventEmitter) {}
    init(container: Container) {
        container.getElement().append(this.gui.domElement);
        addEventListener('mmk-gamepad-axis-value', (e) => {
            for (const listener of this.axes) {
                if (e.axisIndex === listener.axis.axisIndex && e.gamepadIndex === listener.axis.gamepadIndex) {
                    let value = e.axisValue;
                    if (isInRange(listener.axis.deadzone[0], listener.axis.deadzone[1], e.axisValue)) {
                        value = 0;
                    }
                    value = lerpAxisToRange(value, listener.range);
                    listener.onChange(value);
                }
            }
        });
    }
    addProperty(
        name: string,
        getValue: () => number,
        range: [number, number],
        onChange?: (v: number) => any,
        gamepad?: GamePadAxis
    ) {
        this.viewModel[name] = getValue();
        const guiController = this.gui.add(this.viewModel, name, ...range);
        this.modelEvents.on(name, (newVal: number) => {
            this.viewModel[name] = newVal;
            guiController.updateDisplay();
        });
        if (onChange) {
            guiController.onChange(onChange);
            if (gamepad) {
                this.axes.push({ axis: gamepad, onChange, range });
            }
        } else {
            guiController.onChange(() => {
                this.viewModel[name] = getValue();
            });
        }
    }
}
