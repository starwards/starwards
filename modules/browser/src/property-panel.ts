import { GUI } from 'dat.gui';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { Dictionary } from 'lodash';

export interface Panel {
    addProperty(name: string, getValue: () => number, range: [number, number], onChange?: (v: number) => unknown): this;
    addText(name: string, getValue: () => string): this;
}

export class PropertyPanel implements Panel {
    private rootViewModel: Dictionary<number | string> = {};
    private rootGui = new GUI({ autoPlace: false, hideable: false });

    constructor(private modelEvents: EventEmitter) {}
    init(container: Container) {
        container.getElement().append(this.rootGui.domElement);
    }
    destroy() {
        this.rootGui.domElement.parentElement?.removeChild(this.rootGui.domElement);
        this.rootGui.destroy();
    }

    private contextAddProperty(
        guiFolder: GUI,
        viewModel: Dictionary<number | string>,
        name: string,
        getValue: () => number,
        range: [number, number],
        onChange?: (v: number) => unknown
    ) {
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name, ...range);
        if (range[1] === 1) {
            guiController.step(0.01);
        }
        this.modelEvents.on(name, () => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        if (onChange) {
            guiController.onChange(onChange);
        } else {
            guiController.onChange(() => {
                viewModel[name] = getValue();
            });
        }
    }

    contextAddText(guiFolder: GUI, viewModel: Dictionary<number | string>, name: string, getValue: () => string) {
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name);
        this.modelEvents.on(name, () => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        guiController.onChange(() => {
            viewModel[name] = getValue();
        });
    }

    addProperty(name: string, getValue: () => number, range: [number, number], onChange?: (v: number) => unknown) {
        this.contextAddProperty(this.rootGui, this.rootViewModel, name, getValue, range, onChange);
        return this;
    }

    addText(name: string, getValue: () => string) {
        this.contextAddText(this.rootGui, this.rootViewModel, name, getValue);
        return this;
    }

    addFolder(folderName: string): Panel {
        const guiFolder = this.rootGui.addFolder(folderName);
        guiFolder.open();
        const folderViewModel: Dictionary<number | string> = {};
        const folder: Panel = {
            addProperty: (
                name: string,
                getValue: () => number,
                range: [number, number],
                onChange?: (v: number) => unknown
            ) => {
                this.contextAddProperty(guiFolder, folderViewModel, name, getValue, range, onChange);
                return folder;
            },
            addText: (name: string, getValue: () => string) => {
                this.contextAddText(guiFolder, folderViewModel, name, getValue);
                return folder;
            },
        };
        return folder;
    }
}
