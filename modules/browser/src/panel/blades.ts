import { Destructor, RTuple2 } from '@starwards/core';
import {
    FolderApi,
    InputParams,
    ListApi,
    ListBladeParams,
    SliderApi,
    SliderBladeParams,
    TextApi,
    TextBladeParams,
} from 'tweakpane';

import { RingInputParams } from '@tweakpane/plugin-camerakit/dist/types/util';

export type NumericModel = {
    getValue: () => number;
    setValue?: (v: number) => unknown;
    onChange: (cb: () => unknown) => Destructor;
    range: RTuple2;
};

export type Model<T> = {
    getValue: () => T;
    setValue?: (v: T) => unknown;
    onChange: (cb: () => unknown) => Destructor;
};
/*
    This module was written after ./property-panel
    This is the module to use to creatte new panels
*/
/**
 * add a blade for slider panel
 */
export function addSliderBlade(
    guiFolder: FolderApi,
    { getValue, range, onChange, setValue }: NumericModel,
    params: Partial<SliderBladeParams>,
    cleanup: (d: Destructor) => void
) {
    const guiController = guiFolder.addBlade({
        parse: (v: number) => String(v),
        ...params,
        view: 'slider',
        min: range[0],
        max: range[1],
        value: getValue(),
    }) as SliderApi;
    if (setValue) {
        guiController.on('change', (ev) => {
            if (ev.value != getValue()) {
                guiController.value = getValue();
                setValue(ev.value);
            }
        });
    } else {
        guiController.disabled = true;
    }
    const removeStateListener = onChange(() => {
        guiController.value = getValue();
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
    return guiController;
}

/**
 * add a blade for cameraring
 */
export function addCameraRingBlade(
    guiFolder: FolderApi,
    model: Model<number>,
    params: { label: string } & Partial<RingInputParams>,
    cleanup: (d: Destructor) => void
) {
    addInputBlade(guiFolder, model, { series: 0, ...params, view: 'cameraring' }, cleanup);
}

export function addTextBlade<T>(
    guiFolder: FolderApi,
    { getValue, onChange, setValue }: Model<T>,
    params: Partial<TextBladeParams<T>>,
    cleanup: (d: Destructor) => void
) {
    const guiController = guiFolder.addBlade({
        parse: (v: T) => String(v),
        ...params,
        view: 'text',
        value: getValue(),
    }) as TextApi<T>;
    if (setValue) {
        guiController.on('change', (ev) => {
            if (ev.value != getValue()) {
                guiController.value = getValue();
                setValue(ev.value);
            }
        });
    } else {
        guiController.disabled = true;
    }
    const removeStateListener = onChange(() => {
        guiController.value = getValue();
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
    return guiController;
}

export function addEnumListBlade<T>(
    guiFolder: FolderApi,
    { getValue, onChange, setValue }: Model<T>,
    params: Partial<ListBladeParams<T>>,
    cleanup: (d: Destructor) => void
) {
    const guiController = guiFolder.addBlade({
        options: [],
        ...params,
        view: 'list',
        value: getValue(),
    }) as ListApi<T>;
    if (setValue) {
        guiController.on('change', (ev) => {
            if (ev.value != getValue()) {
                guiController.value = getValue();
                setValue(ev.value);
            }
        });
    } else {
        guiController.disabled = true;
    }
    const removeStateListener = onChange(() => {
        guiController.value = getValue();
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
    return guiController;
}

export type InputBladeParams = { label: string } & Partial<InputParams>;
export function addInputBlade<T>(
    guiFolder: FolderApi,
    { getValue, onChange, setValue }: Model<T>,
    params: InputBladeParams,
    cleanup: (d: Destructor) => void
) {
    const viewModel: Record<string, T> = {};
    const { label } = params;
    viewModel[label] = getValue();
    const guiController = guiFolder.addInput(viewModel, label, params);
    const removeStateListener = onChange(() => {
        viewModel[label] = getValue();
        guiController.refresh();
    });
    if (setValue) {
        guiController.on('change', (e) => {
            if (e.value !== getValue()) {
                viewModel[label] = getValue();
                setValue(e.value);
                guiController.refresh();
            }
        });
    } else {
        guiController.disabled = true;
    }
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
    return guiController;
}
