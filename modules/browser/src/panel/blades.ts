import { BaseEventsApi, EventApi } from '../driver/utils';
import { Destructor, SpaceObject } from '@starwards/model';
import { DriverNumericApi, SpaceDriver } from '../driver';
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

export function addInput<K extends keyof SpaceObject>(
    guiFolder: FolderApi,
    subject: SpaceObject,
    propertyName: K,
    params: InputParams,
    setValue: (_newValue: SpaceObject[K]) => void,
    spaceDriver: SpaceDriver,
    cleanup: (d: Destructor) => void
) {
    const guiController = guiFolder.addInput(subject, propertyName, params);
    let lastValue = subject[propertyName];
    guiController.on('change', (e) => {
        const newValue = e.value;
        if (newValue !== lastValue) {
            setValue(newValue);
        }
    });
    const stateListener = (field: string) => {
        if (field === propertyName) {
            const newValue = subject[propertyName];
            if (newValue !== lastValue) {
                lastValue = newValue;
                guiController.refresh();
            }
        }
    };
    spaceDriver.state.events.on(subject.id, stateListener);
    cleanup(() => {
        guiController.dispose();
        spaceDriver.state.events.removeListener(subject.id, stateListener);
    });
}
