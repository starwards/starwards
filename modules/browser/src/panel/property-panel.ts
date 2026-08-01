import * as CamerakitPlugin from '@tweakpane/plugin-camerakit';
import * as TextareaPlugin from '@pangenerator/tweakpane-textarea-plugin';

import { FolderApi, InputBindingApi, Pane } from 'tweakpane';
import { Model, NumericModel } from './blades';

import { Destructors } from '@starwards/core';
import { EmitterLoop } from '../loop';
import { WidgetContainer } from '../container';
import { createWidgetPane } from './widget-pane';

/*
    This module was written originally for the Dat.gui API.
    Since then it was adapted to tweakpane. 
    It is deprecated. 
    for new panels use ./blades.ts instead
*/

export type TextProperty = {
    getValue: () => string;
};

export interface Panel {
    addConfig(name: string, property: Model<number>): this;
    addProperty(name: string, property: NumericModel): this;
    addText(name: string, property: TextProperty): this;
}
type ViewModel = Record<string, number | string>;
export class PropertyPanel implements Panel {
    private rootViewModel: ViewModel = {};
    private pane: Pane;
    private cleanup: Destructors;
    private viewLoop = new EmitterLoop();
    constructor(container: WidgetContainer) {
        const { pane, cleanup } = createWidgetPane(container, 'Properties');
        this.pane = pane;
        this.cleanup = cleanup;
        this.cleanup.add(() => this.viewLoop.stop());
        this.pane.registerPlugin(CamerakitPlugin);
        this.pane.registerPlugin(TextareaPlugin);
        this.viewLoop.start();
    }
    destroy() {
        this.cleanup.destroy();
    }

    private addInput<T extends number | string>(
        guiFolder: FolderApi,
        viewModel: ViewModel,
        name: string,
        getValue: () => T | undefined,
        params: Record<string, unknown>,
    ) {
        const value = getValue();
        // Set initial value before addInput so Tweakpane can infer controller type
        if (value !== undefined) {
            viewModel[name] = value;
        }
        const guiController = guiFolder.addBinding(viewModel, name, params) as InputBindingApi<unknown, T>;
        if (value !== undefined) {
            let lastGetValue = value;
            this.viewLoop.onLoop(() => {
                const newGetValue = getValue();
                if (newGetValue !== undefined && newGetValue !== lastGetValue) {
                    viewModel[name] = lastGetValue = newGetValue;
                    guiController.refresh();
                }
            });
        }
        return guiController;
    }

    private contextAddConfig(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: Model<number>) {
        const { getValue, setValue } = property;
        const options = {
            view: 'cameraring',
            series: 0,
        };
        const guiController = this.addInput(guiFolder, viewModel, name, getValue, options);
        if (setValue) {
            guiController.on('change', (ev) => setValue(ev.value));
        } else {
            guiController.disabled = true;
        }
    }

    private contextAddProperty(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: NumericModel) {
        const { getValue, range, setValue } = property;
        const options: Record<string, unknown> = { min: range[0], max: range[1] };
        if (range[1] === 1) {
            options.step = 0.01;
        }
        const guiController = this.addInput(guiFolder, viewModel, name, getValue, options);
        if (setValue) {
            guiController.on('change', (ev) => setValue(ev.value));
        } else {
            guiController.disabled = true;
        }
    }

    private contextAddText(guiFolder: FolderApi, viewModel: ViewModel, name: string, property: TextProperty) {
        const { getValue } = property;
        this.addInput(guiFolder, viewModel, name, getValue, {});
    }

    addConfig(name: string, property: Model<number>) {
        this.contextAddConfig(this.pane, this.rootViewModel, name, property);
        return this;
    }

    addProperty(name: string, property: NumericModel) {
        this.contextAddProperty(this.pane, this.rootViewModel, name, property);
        return this;
    }

    addText(name: string, property: TextProperty) {
        this.contextAddText(this.pane, this.rootViewModel, name, property);
        return this;
    }

    addFolder(folderName: string, expanded = true): Panel {
        const guiFolder = this.pane.addFolder({ title: folderName, expanded });
        const folderViewModel: ViewModel = {};
        const folder: Panel = {
            addConfig: (name: string, property: Model<number>) => {
                this.contextAddConfig(guiFolder, folderViewModel, name, property);
                return folder;
            },
            addProperty: (name: string, property: NumericModel) => {
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
            const preset = this.pane.exportState();
            delete preset[presetKey];
            return JSON.stringify(preset, null, 2);
        };
        const guiController = this.addInput(guiFolder, this.rootViewModel, presetKey, getValue, options);

        guiController.on('change', (ev) => {
            try {
                const val = JSON.parse(ev.value) as Record<string, unknown>;
                if (typeof val === 'object' && val) {
                    this.pane.importState(val);
                }
            } catch (e) {
                void 0; // do nothing
            }
        });
    }
}
