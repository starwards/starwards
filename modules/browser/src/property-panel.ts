import * as CamerakitPlugin from '@tweakpane/plugin-camerakit';

import { FolderApi, InputBindingApi, InputParams, Pane } from 'tweakpane';

import { BaseApi } from './driver/utils';
import { Container } from 'golden-layout';
import { DriverNumericApi } from './driver';
import { EmitterLoop } from './loop';

export type TextProperty = {
    getValue: () => string;
    setValue: (v: boolean) => unknown;
};

export interface Panel {
    addConfig(name: string, property: BaseApi<number>): this;
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
        this.rootGui.registerPlugin(CamerakitPlugin);
        this.viewLoop.start();
    }
    destroy() {
        this.viewLoop.stop();
        this.rootGui.dispose();
    }

    private contextAddConfig(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: BaseApi<number>) {
        const { getValue, setValue } = property;
        viewModel[name] = getValue();
        const guiController = guiFolder.addInput(viewModel, name, {
            view: 'cameraring',
            series: 0,
        }) as InputBindingApi<unknown, number>;
        let lastGetValue = getValue();
        this.viewLoop.onLoop(() => {
            const newGetValue = getValue();
            if (newGetValue !== lastGetValue) {
                viewModel[name] = lastGetValue = newGetValue;
                guiController.refresh();
            }
        });
        guiController.on('change', (ev) => setValue(ev.value));
    }

    private contextAddProperty(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: DriverNumericApi) {
        const { getValue, range, setValue } = property;
        viewModel[name] = getValue();
        const options: InputParams = { min: range[0], max: range[1] };
        if (range[1] === 1) {
            options.step = 0.01;
        }
        const guiController: InputBindingApi<unknown, number> = guiFolder.addInput(viewModel, name, options);
        let lastGetValue = getValue();
        this.viewLoop.onLoop(() => {
            const newGetValue = getValue();
            if (newGetValue !== lastGetValue) {
                viewModel[name] = lastGetValue = newGetValue;
                guiController.refresh();
            }
        });
        guiController.on('change', (ev) => setValue(ev.value));
    }

    private contextAddText(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: TextProperty) {
        const { getValue } = property;
        viewModel[name] = getValue();
        const guiController: InputBindingApi<unknown, number> = guiFolder.addInput(viewModel, name);
        this.viewLoop.onLoop(() => {
            viewModel[name] = getValue();
            guiController.refresh();
        });
    }

    addConfig(name: string, property: BaseApi<number>) {
        this.contextAddConfig(this.rootGui, this.rootViewModel, name, property);
        return this;
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
            addConfig: (name: string, property: BaseApi<number>) => {
                this.contextAddConfig(guiFolder, folderViewModel, name, property);
                return folder;
            },
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
