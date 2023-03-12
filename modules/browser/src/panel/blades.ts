import {
    BladeApi,
    FolderApi,
    InputParams,
    ListApi,
    ListBladeParams,
    SliderApi,
    SliderBladeParams,
    TextApi,
    TextBladeParams,
} from 'tweakpane';
import { BladeController, ButtonParams, View } from '@tweakpane/core';
import { Destructor, RTuple2 } from '@starwards/core';

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

export function configSliderBlade(params: Partial<SliderBladeParams>, range: RTuple2, getValue: () => number) {
    return {
        parse: (v: number) => String(v),
        ...params,
        view: 'slider',
        min: range[0],
        max: range[1],
        value: getValue(),
    };
}

export function configTextBlade(params: Partial<TextBladeParams<unknown>> = {}, getValue: () => unknown = () => '') {
    return {
        parse: (v: unknown) => String(v),
        ...params,
        view: 'text',
        value: getValue(),
    };
}

export function configEnumListBlade<T>(params: Partial<ListBladeParams<T>>, getValue: () => T) {
    return {
        options: [],
        ...params,
        view: 'list',
        value: getValue(),
    };
}

export type BladeGuiApi<T> = {
    value: T;
    on(eventName: 'change', handler: (ev: { value: T }) => void): unknown;
} & BladeApi<BladeController<View>>;

export function wireBlade<T>(
    blade: BladeGuiApi<T>,
    { getValue, onChange, setValue }: Model<T>,
    cleanup: (d: Destructor) => void
) {
    blade.value = getValue();
    if (setValue) {
        blade.on('change', (ev) => {
            if (ev.value !== getValue()) {
                blade.value = getValue();
                setValue(ev.value);
            }
        });
    } else {
        blade.disabled = true;
    }
    const removeStateListener = onChange(() => {
        blade.value = getValue();
    });
    cleanup(() => {
        blade.dispose();
        removeStateListener();
    });
}

/**
 * add a blade for slider panel
 */
export function addSliderBlade(
    guiFolder: FolderApi,
    model: NumericModel,
    params: Partial<SliderBladeParams>,
    cleanup: (d: Destructor) => void
) {
    const blade = guiFolder.addBlade(configSliderBlade(params, model.range, model.getValue)) as SliderApi;
    wireBlade(blade, model, cleanup);
    return blade;
}

export function addTextBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: Partial<TextBladeParams<T>>,
    cleanup: (d: Destructor) => void
) {
    const blade = guiFolder.addBlade(
        configTextBlade(params as Partial<TextBladeParams<unknown>>, model.getValue)
    ) as TextApi<T>;
    wireBlade(blade, model, cleanup);
    return blade;
}

export function addEnumListBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: Partial<ListBladeParams<T>>,
    cleanup: (d: Destructor) => void
) {
    const blade = guiFolder.addBlade(configEnumListBlade<T>(params, model.getValue)) as ListApi<T>;
    wireBlade(blade, model, cleanup);
    return blade;
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

export function addButtonBlade(
    guiFolder: FolderApi,
    onClick: () => unknown,
    params: { label: string } & ButtonParams,
    cleanup: (d: Destructor) => void
) {
    const button = guiFolder.addButton({ ...params }).on('click', onClick);
    cleanup(() => {
        button.dispose();
    });
}

export type InputBladeParams = { label: string } & Partial<InputParams>;

export function addInputBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: InputBladeParams,
    cleanup: (d: Destructor) => void
) {
    const viewModel: Record<string, T> = {};
    const { label } = params;
    viewModel[label] = model.getValue();
    const input = guiFolder.addInput(viewModel, label, params);
    const bladeApi = Object.create(input, {
        value: {
            get: () => viewModel[label],
            set: (v: T) => {
                viewModel[label] = v;
                input.refresh();
            },
        },
    }) as BladeGuiApi<T>;
    wireBlade(bladeApi, model, cleanup);
    return input;
}
