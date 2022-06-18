import { FolderApi, InputBindingApi, InputParams, Pane } from 'tweakpane';

import { Container } from 'golden-layout';
import { DriverNumericApi } from './driver';
import { EmitterLoop } from './loop';

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
    private rootGui: Pane;
    private viewLoop = new EmitterLoop();
    constructor(container: Container) {
        this.rootGui = new Pane({ container: container.getElement().get(0) });
        this.viewLoop.start();
    }
    destroy() {
        this.viewLoop.stop();
        this.rootGui.dispose();
    }

    private contextAddProperty(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: DriverNumericApi) {
        const { getValue, range, setValue } = property;
        viewModel[name] = getValue();
        const options: InputParams = { min: range[0], max: range[1] };
        if (range[1] === 1) {
            options.step = 0.01;
        }
        const guiController: InputBindingApi<unknown, number> = guiFolder.addInput(viewModel, name, options);
        this.viewLoop.onLoop(() => {
            viewModel[name] = getValue();
            guiController.refresh();
        });
        guiController.on('change', (ev) => setValue(ev.value));
    }

    contextAddText(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: TextProperty) {
        const { getValue } = property;
        viewModel[name] = getValue();
        const guiController: InputBindingApi<unknown, number> = guiFolder.addInput(viewModel, name);
        this.viewLoop.onLoop(() => {
            viewModel[name] = getValue();
            guiController.refresh();
        });
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
        const guiFolder = this.rootGui.addFolder({ title: folderName, expanded: true });
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
