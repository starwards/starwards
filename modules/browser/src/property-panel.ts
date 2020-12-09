import { GUI } from 'dat.gui';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { Dictionary } from 'lodash';
import { NumericProperty, TextProperty } from './ship-properties';

export interface Panel {
    addProperty(property: NumericProperty): this;
    addText(property: TextProperty): this;
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

    private contextAddProperty(guiFolder: GUI, viewModel: Dictionary<number | string>, property: NumericProperty) {
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

    contextAddText(guiFolder: GUI, viewModel: Dictionary<number | string>, property: TextProperty) {
        const { name, getValue, onChange } = property;
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name);
        this.modelEvents.on(name, () => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        guiController.onChange(onChange);
    }

    addProperty(property: NumericProperty) {
        this.contextAddProperty(this.rootGui, this.rootViewModel, property);
        return this;
    }

    addText(property: TextProperty) {
        this.contextAddText(this.rootGui, this.rootViewModel, property);
        return this;
    }

    addFolder(folderName: string): Panel {
        const guiFolder = this.rootGui.addFolder(folderName);
        guiFolder.open();
        const folderViewModel: Dictionary<number | string> = {};
        const folder: Panel = {
            addProperty: (property: NumericProperty) => {
                this.contextAddProperty(guiFolder, folderViewModel, property);
                return folder;
            },
            addText: (property: TextProperty) => {
                this.contextAddText(guiFolder, folderViewModel, property);
                return folder;
            },
        };
        return folder;
    }
}
