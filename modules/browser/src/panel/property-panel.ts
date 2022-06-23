import * as CamerakitPlugin from '@tweakpane/plugin-camerakit';
import * as TextareaPlugin from '@pangenerator/tweakpane-textarea-plugin';

import { FolderApi, InputBindingApi, InputParams, Pane } from 'tweakpane';

import { BaseApi } from '../driver/utils';
import { Container } from 'golden-layout';
import { DriverNumericApi } from '../driver';
import { EmitterLoop } from '../loop';
import { PresetObject } from 'tweakpane/dist/types/blade/root/api/preset';

/*
    This module was written originally for the Dat.gui API.
    Since then it was adapted to tweakpane. 
    It is deprecated. 
    for new panels use ./blades.ts instead
*/

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
    private pane: Pane;
    private viewLoop = new EmitterLoop();
    constructor(container: Container) {
        this.pane = new Pane({ container: container.getElement().get(0) });
        this.pane.registerPlugin(CamerakitPlugin);
        this.pane.registerPlugin(TextareaPlugin);
        this.viewLoop.start();
    }
    destroy() {
        this.viewLoop.stop();
        this.pane.dispose();
    }

    private addInput<T extends number | string>(
        guiFolder: FolderApi,
        viewModel: ViewModel,
        name: string,
        getValue: () => T,
        params: InputParams
    ) {
        let lastGetValue = (viewModel[name] = getValue());
        const guiController: InputBindingApi<unknown, T> = guiFolder.addInput(viewModel, name, params);
        this.viewLoop.onLoop(() => {
            const newGetValue = getValue();
            if (newGetValue !== lastGetValue) {
                viewModel[name] = lastGetValue = newGetValue;
                guiController.refresh();
            }
        });
        return guiController;
    }

    private contextAddConfig(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: BaseApi<number>) {
        const { getValue, setValue } = property;
        const options = {
            view: 'cameraring',
            series: 0,
        };
        const guiController = this.addInput(guiFolder, viewModel, name, getValue, options);
        guiController.on('change', (ev) => setValue(ev.value));
    }

    private contextAddProperty(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: DriverNumericApi) {
        const { getValue, range, setValue } = property;
        const options: InputParams = { min: range[0], max: range[1] };
        if (range[1] === 1) {
            options.step = 0.01;
        }
        const guiController = this.addInput(guiFolder, viewModel, name, getValue, options);
        guiController.on('change', (ev) => setValue(ev.value));
    }

    private contextAddText(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: TextProperty) {
        const { getValue } = property;
        this.addInput(guiFolder, viewModel, name, getValue, {});
    }

    addConfig(name: string, property: BaseApi<number>) {
        this.contextAddConfig(this.pane, this.rootViewModel, name, property);
        return this;
    }

    addProperty(name: string, property: DriverNumericApi) {
        this.contextAddProperty(this.pane, this.rootViewModel, name, property);
        return this;
    }

    addText(name: string, property: TextProperty) {
        this.contextAddText(this.pane, this.rootViewModel, name, property);
        return this;
    }

    addFolder(folderName: string): Panel {
        const guiFolder = this.pane.addFolder({ title: folderName, expanded: true });
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

    addImportExport() {
        const guiFolder = this.pane.addFolder({ title: 'Import / Export', expanded: false });
        const presetKey = 'JSON';
        const options = {
            presetKey,
            view: 'textarea',
            // lineCount: 6,
        };
        const getValue = () => {
            const preset = this.pane.exportPreset();
            delete preset[presetKey];
            return JSON.stringify(preset, null, 2);
        };
        const guiController = this.addInput(guiFolder, this.rootViewModel, presetKey, getValue, options);

        guiController.on('change', (ev) => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const val = JSON.parse(ev.value) as PresetObject;
                if (typeof val === 'object' && val) {
                    this.pane.importPreset(val);
                }
            } catch (e) {
                void 0; // do nothing
            }
        });
    }
}
