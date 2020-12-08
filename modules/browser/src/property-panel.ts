import { GUI } from 'dat.gui';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { Dictionary } from 'lodash';
import { ShipProperty } from './ship-properties';

export interface Panel {
    addProperty(property: ShipProperty): this;
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

    private contextAddProperty(guiFolder: GUI, viewModel: Dictionary<number | string>, property: ShipProperty) {
        const { name, getValue, range, onChange } = property;
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name, ...range);
        if (range[1] === 1) {
            guiController.step(0.01);
        }
        this.modelEvents.on(name, () => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        guiController.onChange(onChange);
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

    addProperty(property: ShipProperty) {
        this.contextAddProperty(this.rootGui, this.rootViewModel, property);
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
            addProperty: (property: ShipProperty) => {
                this.contextAddProperty(guiFolder, folderViewModel, property);
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
