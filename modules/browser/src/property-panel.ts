import { Container } from 'golden-layout';
import { Dictionary } from 'lodash';
import { DriverNumericApi } from './driver/utils';
import { EmitterLoop } from './loop';
import { GUI } from 'dat.gui';

export type TextProperty = {
    getValue: () => string;
    onChange: (v: boolean) => unknown;
};

export interface Panel {
    addProperty(name: string, property: DriverNumericApi): this;
    addText(name: string, property: TextProperty): this;
}

export class PropertyPanel implements Panel {
    private rootViewModel: Dictionary<number | string> = {};
    private rootGui = new GUI({ autoPlace: false, hideable: false });
    private viewLoop = new EmitterLoop();
    init(container: Container) {
        container.getElement().append(this.rootGui.domElement);
        this.viewLoop.start();
    }
    destroy() {
        this.rootGui.domElement.parentElement?.removeChild(this.rootGui.domElement);
        this.rootGui.destroy();
        this.viewLoop.stop();
    }

    private contextAddProperty(
        guiFolder: GUI,
        viewModel: Dictionary<number | string>,
        name: string,
        property: DriverNumericApi
    ) {
        const { getValue, range, onChange } = property;
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name, ...range);
        if (range[1] === 1) {
            guiController.step(0.01);
        }
        this.viewLoop.onLoop(() => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        guiController.onChange(onChange);
    }

    contextAddText(guiFolder: GUI, viewModel: Dictionary<number | string>, name: string, property: TextProperty) {
        const { getValue, onChange } = property;
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name);
        this.viewLoop.onLoop(() => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        guiController.onChange(onChange);
    }

    addProperty(name: string, property: DriverNumericApi) {
        this.contextAddProperty(this.rootGui, this.rootViewModel, name, property);
        return this;
    }

    addText(name: string, property: TextProperty) {
        this.contextAddText(this.rootGui, this.rootViewModel, name, property);
        return this;
    }

    addFolder(folderName: string): Panel {
        const guiFolder = this.rootGui.addFolder(folderName);
        guiFolder.open();
        const folderViewModel: Dictionary<number | string> = {};
        const folder: Panel = {
            addProperty: (name: string, property: DriverNumericApi) => {
                this.contextAddProperty(guiFolder, folderViewModel, name, property);
                return folder;
            },
            addText: (name: string, property: TextProperty) => {
                this.contextAddText(guiFolder, folderViewModel, name, property);
                return folder;
            },
        };
        return folder;
    }
}
