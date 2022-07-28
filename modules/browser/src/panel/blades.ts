import { BaseEventsApi, Destructor, DriverNumericApi, EventApi } from '@starwards/model';
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

/*
    This module was written after ./property-panel
    This is the module to use to creatte new panels
*/
export function addSliderBlade<T>(
    guiFolder: FolderApi,
    api: DriverNumericApi & EventApi,
    params: Partial<SliderBladeParams>,
    cleanup: (d: Destructor) => void
) {
    const guiController = guiFolder.addBlade({
        parse: (v: T) => String(v),
        ...params,
        view: 'slider',
        min: api.range[0],
        max: api.range[1],
        value: api.getValue(),
    }) as SliderApi;
    guiController.on('change', (e) => {
        api.setValue(e.value);
    });
    const removeStateListener = api.onChange(() => {
        guiController.value = api.getValue();
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
}

export function addTextBlade<T>(
    guiFolder: FolderApi,
    api: BaseEventsApi<T>,
    params: Partial<TextBladeParams<T>>,
    cleanup: (d: Destructor) => void
) {
    const guiController = guiFolder.addBlade({
        parse: (v: T) => String(v),
        ...params,
        view: 'text',
        value: api.getValue(),
    }) as TextApi<T>;
    guiController.on('change', (e) => {
        api.setValue(e.value);
    });
    const removeStateListener = api.onChange(() => {
        guiController.value = api.getValue();
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
}

export function addEnumListBlade<T>(
    guiFolder: FolderApi,
    api: BaseEventsApi<T>,
    params: Partial<ListBladeParams<T>>,
    cleanup: (d: Destructor) => void
) {
    let lastValue = api.getValue();
    const guiController = guiFolder.addBlade({
        parse: (v: T) => String(v),
        options: [],
        ...params,
        view: 'list',
        value: lastValue,
    }) as ListApi<T>;
    guiController.on('change', (e) => {
        const newValue = e.value;
        if (newValue !== lastValue) {
            api.setValue(newValue);
        }
    });
    const removeStateListener = api.onChange(() => {
        const newValue = api.getValue();
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
    api: BaseEventsApi<T>,
    params: InputBladeParams,
    cleanup: (d: Destructor) => void
) {
    const viewModel: Record<string, T> = {};
    const { label } = params;
    let lastValue = (viewModel[label] = api.getValue());
    const guiController = guiFolder.addInput(viewModel, label, params);
    const removeStateListener = api.onChange(() => {
        lastValue = viewModel[label] = api.getValue();
        guiController.refresh();
    });
    guiController.on('change', (e) => {
        if (e.value !== lastValue) {
            api.setValue(e.value);
        }
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
}
