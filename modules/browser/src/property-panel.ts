import { Container } from 'golden-layout';
import { DriverNumericApi } from './driver';
import { EmitterLoop } from './loop';
import { GUI } from 'dat.gui';

export type TextProperty = {
    getValue: () => string;
    setValue: (v: boolean) => unknown;
};

export interface Panel {
    addProperty(name: string, property: DriverNumericApi): this;
    addText(name: string, property: TextProperty): this;
}
type ViewModel = Record<string, number | string>;
export class PropertyPanel implements Panel {
    private rootViewModel: ViewModel = {};
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

    private contextAddProperty(guiFolder: GUI, viewModel: ViewModel, name: string, property: DriverNumericApi) {
        const { getValue, range, setValue } = property;
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name, ...range);
        if (range[1] === 1) {
            guiController.step(0.01);
        }
        this.viewLoop.onLoop(() => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        guiController.onChange(setValue);
    }

    contextAddText(guiFolder: GUI, viewModel: ViewModel, name: string, property: TextProperty) {
        const { getValue, setValue } = property;
        viewModel[name] = getValue();
        const guiController = guiFolder.add(viewModel, name);
        this.viewLoop.onLoop(() => {
            viewModel[name] = getValue();
            guiController.updateDisplay();
        });
        guiController.onChange(setValue);
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
        const folderViewModel: ViewModel = {};
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
