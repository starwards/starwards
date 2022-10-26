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

import { Destructor } from '@starwards/core';
import { RingInputParams } from '@tweakpane/plugin-camerakit/dist/types/util';

export type NumericModel = {
    getValue: () => number;
    setValue?: (v: number) => unknown;
    onChange: (cb: () => unknown) => Destructor;
    range: readonly [number, number];
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
    model: NumericModel,
    params: Partial<SliderBladeParams>,
    cleanup: (d: Destructor) => void
) {
    const { getValue, range, onChange, setValue } = model;
    const guiController = guiFolder.addBlade({
        parse: (v: number) => String(v),
        ...params,
        view: 'slider',
        min: range[0],
        max: range[1],
        value: getValue(),
    }) as SliderApi;
    if (setValue) {
        guiController.on('change', (ev) => setValue(ev.value));
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
}

/**
 * add a blade for numeric field with no range
 */
export function addDesignPropBlade(
    guiFolder: FolderApi,
    model: Model<number>,
    params: { label: string } & Partial<RingInputParams>,
    cleanup: (d: Destructor) => void
) {
    addInputBlade(guiFolder, model, { series: 0, ...params, view: 'cameraring' }, cleanup);
}

export function addTextBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: Partial<TextBladeParams<T>>,
    cleanup: (d: Destructor) => void
) {
    const { getValue, onChange, setValue } = model;
    const guiController = guiFolder.addBlade({
        parse: (v: T) => String(v),
        ...params,
        view: 'text',
        value: getValue(),
    }) as TextApi<T>;
    if (setValue) {
        guiController.on('change', (ev) => setValue(ev.value));
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
}

export function addEnumListBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: Partial<ListBladeParams<T>>,
    cleanup: (d: Destructor) => void
) {
    const { getValue, onChange, setValue } = model;
    let lastValue = getValue();
    const guiController = guiFolder.addBlade({
        options: [],
        ...params,
        view: 'list',
        value: lastValue,
    }) as ListApi<T>;
    if (setValue) {
        guiController.on('change', (e) => {
            if (e.value !== lastValue) {
                setValue(e.value);
            }
        });
    } else {
        guiController.disabled = true;
    }
    const removeStateListener = onChange(() => {
        const newValue = getValue();
        if (newValue !== lastValue) {
            lastValue = newValue;
            guiController.value = newValue;
        }
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
}

export type InputBladeParams = { label: string } & Partial<InputParams>;
export function addInputBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: InputBladeParams,
    cleanup: (d: Destructor) => void
) {
    const { getValue, onChange, setValue } = model;
    const viewModel: Record<string, T> = {};
    const { label } = params;
    let lastValue = (viewModel[label] = getValue());
    const guiController = guiFolder.addInput(viewModel, label, params);
    const removeStateListener = onChange(() => {
        lastValue = viewModel[label] = getValue();
        guiController.refresh();
    });
    if (setValue) {
        guiController.on('change', (e) => {
            if (e.value !== lastValue) {
                setValue(e.value);
            }
        });
    } else {
        guiController.disabled = true;
    }
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
}
