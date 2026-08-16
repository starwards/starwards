import {
    BladeApi,
    ButtonApi,
    FolderApi,
    ListBladeApi,
    ListBladeParams,
    Pane,
    SliderBladeParams,
    TextBladeParams,
} from 'tweakpane';
import { BladeController, ButtonParams, NumberMonitorParams, View } from '@tweakpane/core';
import { Destructor, RTuple2 } from '@starwards/core';

import { RingInputParams } from '@tweakpane/plugin-camerakit/dist/types/util';
import { RowApi } from 'tweakpane-table';

export type NumericModel = {
    getValue: () => number | undefined;
    setValue?: (v: number) => unknown;
    onChange: (cb: () => unknown) => Destructor;
    range: RTuple2;
};

export type Model<T> = {
    getValue: () => T | undefined;
    setValue?: (v: T) => unknown;
    onChange: (cb: () => unknown) => Destructor;
};
/*
    This module was written after ./property-panel
    This is the module to use to creatte new panels
*/

export function createPane(params: { title?: string; container?: HTMLElement }): Pane {
    const pane = new Pane(params);
    if (params.title) {
        pane.element.dataset.id = params.title;
    }
    return pane;
}

function configSliderBlade(params: Partial<SliderBladeParams>, range: RTuple2, getValue: () => number | undefined) {
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

function configListBlade<T>(params: Partial<ListBladeParams<T>>, getValue: () => T | undefined) {
    return {
        options: [],
        ...params,
        view: 'list',
        value: getValue(),
    };
}

type BladeGuiApi<T> = {
    value: T;
    on(eventName: 'change', handler: (ev: { value: T }) => void): unknown;
} & BladeApi<BladeController<View>>;

function wireBlade<T>(
    blade: BladeGuiApi<T>,
    { getValue, onChange, setValue }: Model<T>,
    cleanup: (d: Destructor) => void,
) {
    const v = getValue();
    if (v !== undefined) {
        blade.value = v;
    }
    if (setValue) {
        blade.on('change', (ev) => {
            const value = getValue();
            if (value !== undefined && ev.value !== value) {
                blade.value = value;
                setValue(ev.value);
            }
        });
    } else {
        blade.disabled = true;
    }
    const removeStateListener = onChange(() => {
        const value = getValue();
        if (value !== undefined) {
            blade.value = value;
            tagValueData(blade, value);
        }
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
    cleanup: (d: Destructor) => void,
) {
    const blade = guiFolder.addBlade(configSliderBlade(params, model.range, model.getValue)) as BladeGuiApi<number>;
    wireBlade(blade, model, cleanup);
    return blade;
}

/**
 * Add a non-interactive bar blade to a folder/pane: shows where a read-only value sits within
 * its range, styled (see `.sw-bar` in tweakpane.css) to hide the drag handle so it doesn't look
 * draggable.
 */
export function addBarBlade(
    guiFolder: FolderApi,
    model: NumericModel,
    params: Partial<SliderBladeParams>,
    cleanup: (d: Destructor) => void,
) {
    const blade = guiFolder.addBlade(configSliderBlade(params, model.range, model.getValue)) as BladeGuiApi<number>;
    blade.element.classList.add('sw-bar');
    wireBlade(blade, model, cleanup);
    return blade;
}

export function addTextBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: Partial<TextBladeParams<T>>,
    cleanup: (d: Destructor) => void,
) {
    const blade = guiFolder.addBlade(
        configTextBlade(params as Partial<TextBladeParams<unknown>>, model.getValue),
    ) as BladeGuiApi<T>;
    wireBlade(blade, model, cleanup);
    return blade;
}

/**
 * A text blade whose background reflects where the live value sits against `warnBelow`/`errorAt`
 * thresholds (same `data-status`/`tp-rotv` mechanism `system-status.ts` uses for discrete
 * OK/WARN/ERROR mappings — see tweakpane.css) — for a continuous readout (e.g. reactor energy)
 * that needs to visibly alarm as it runs low, not just report a number.
 */
export function addThresholdTextBlade(
    guiFolder: FolderApi,
    model: NumericModel,
    params: Partial<TextBladeParams<number>> & { warnBelow: number; errorAt?: number },
    cleanup: (d: Destructor) => void,
) {
    const { warnBelow, errorAt = model.range[0], ...textParams } = params;
    const blade = addTextBlade(guiFolder, model, textParams, cleanup);
    blade.element.classList.add('tp-rotv');
    const applyTheme = () => {
        const value = model.getValue();
        blade.element.dataset.status =
            value === undefined ? '' : value <= errorAt ? 'ERROR' : value < warnBelow ? 'WARN' : 'OK';
    };
    cleanup(model.onChange(applyTheme));
    applyTheme();
    return blade;
}

export function addEnumListBlade(
    guiFolder: FolderApi,
    model: Model<number>,
    label: string,
    enumObj: { [name: string | number]: string | number },
    cleanup: (d: Destructor) => void,
) {
    const options = Object.values(enumObj)
        .filter<number>((k): k is number => typeof k === 'number')
        .filter((k) => !String(enumObj[k]).endsWith('_COUNT'))
        .map((value) => ({ value, text: String(enumObj[value]) }));
    return addListBlade(guiFolder, model, { label, options }, cleanup);
}

export function addListBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: Partial<ListBladeParams<T>>,
    cleanup: (d: Destructor) => void,
) {
    const blade = guiFolder.addBlade(configListBlade<T>(params, model.getValue)) as ListBladeApi<T>;
    wireBlade(blade, model, cleanup);
    return blade;
}

/**
 * Add a searchable select list (tweakpane4-search-list-plugin). `options` is a
 * { displayText: value } map, matching the plugin's `search-list` view. The pane
 * this is added to must have registered the plugin (see tweak.ts). Useful when the
 * option set is large enough that a plain dropdown is unwieldy (e.g. target picking).
 */
export function addSearchListBlade(
    guiFolder: FolderApi,
    model: Model<string>,
    params: { label: string; options: Record<string, string> } & Record<string, unknown>,
    cleanup: (d: Destructor) => void,
) {
    return addInputBlade(guiFolder, model, { ...params, view: 'search-list' }, cleanup);
}

/**
 * Add a color picker for a numeric 0xRRGGBB value (tweakpane's built-in color view).
 */
export function addColorBlade(
    guiFolder: FolderApi,
    model: Model<number>,
    params: { label: string },
    cleanup: (d: Destructor) => void,
) {
    return addInputBlade(guiFolder, model, { ...params, view: 'color' }, cleanup);
}

/**
 * add a blade for cameraring
 */
export function addCameraRingBlade(
    guiFolder: FolderApi,
    model: Model<number>,
    params: { label: string } & Partial<RingInputParams>,
    cleanup: (d: Destructor) => void,
) {
    addInputBlade(guiFolder, model, { series: 0, ...params, view: 'cameraring' }, cleanup);
}

export function addButton(
    guiFolder: FolderApi,
    onClick: () => unknown,
    params: { label: string } & ButtonParams,
    cleanup: (d: Destructor) => void,
) {
    const button = guiFolder.addButton({ ...params }).on('click', onClick);
    cleanup(() => {
        button.dispose();
    });
    return button;
}

export function addGraph(
    guiFolder: FolderApi,
    model: NumericModel,
    params: { label: string } & Partial<NumberMonitorParams>,
    cleanup: (d: Destructor) => void,
) {
    const graph = guiFolder.addBinding(
        {
            get value() {
                return model.getValue();
            },
        },
        'value',
        {
            ...params,
            readonly: true,
            view: 'graph',
            min: model.range[0],
            max: model.range[1],
        },
    );
    cleanup(() => {
        graph.dispose();
    });
}

type InputBladeParams = { label: string } & Record<string, unknown>;

export function addInputBlade<T>(
    guiFolder: FolderApi,
    model: Model<T>,
    params: InputBladeParams,
    cleanup: (d: Destructor) => void,
) {
    const viewModel: Record<string, T> = {};
    const { label } = params;
    const value = model.getValue();
    if (value !== undefined) {
        viewModel[label] = value;
    }
    const input = guiFolder.addBinding(viewModel, label, params);
    // Add data attributes for E2E testing after input is created
    if (value !== undefined) {
        tagValueData(input, value);
    }
    const bladeApi = Object.create(input, {
        value: {
            get: () => viewModel[label],
            set: (v: T) => {
                viewModel[label] = v;
                tagValueData(input, v);
                input.refresh();
            },
        },
    }) as BladeGuiApi<T>;
    wireBlade(bladeApi, model, cleanup);
    return input;
}

/**
 * add value to DOM dataset for css selectors
 */
function tagValueData(input: { readonly element: HTMLElement }, value: unknown) {
    if (typeof value === 'boolean') {
        const inputElement = input.element.querySelector('input');
        if (inputElement) {
            inputElement.dataset.checked = String(value);
            inputElement.dataset.value = String(value);
        }
    }
}

/**
 * Add a text cell to a table row (tweakpane-table v0.4+)
 */
export function addTextCellToRow<T>(
    row: RowApi,
    model: Model<T>,
    params: Partial<TextBladeParams<T>>,
    cleanup: (d: Destructor) => void,
) {
    const blade = row.addCell(
        configTextBlade(params as Partial<TextBladeParams<unknown>>, model.getValue),
    ) as BladeGuiApi<T>;
    wireBlade(blade, model, cleanup);
    return blade;
}

/**
 * Add a non-interactive bar cell to a table row: shows where a read-only value sits within its
 * range, styled (see `.sw-bar` in tweakpane.css) to hide the drag handle so it doesn't look draggable.
 */
export function addBarCellToRow(
    row: RowApi,
    model: NumericModel,
    params: Partial<SliderBladeParams>,
    cleanup: (d: Destructor) => void,
) {
    const blade = row.addCell(configSliderBlade(params, model.range, model.getValue)) as BladeGuiApi<number>;
    blade.element.classList.add('sw-bar');
    wireBlade(blade, model, cleanup);
    return blade;
}

/**
 * Add an interactive slider cell to a table row (tweakpane-table v0.4+) — the row-cell
 * counterpart of `addSliderBlade`.
 */
export function addSliderCellToRow(
    row: RowApi,
    model: NumericModel,
    params: Partial<SliderBladeParams>,
    cleanup: (d: Destructor) => void,
) {
    const blade = row.addCell(configSliderBlade(params, model.range, model.getValue)) as BladeGuiApi<number>;
    wireBlade(blade, model, cleanup);
    return blade;
}

/**
 * Add a list (dropdown) cell to a table row (tweakpane-table v0.4+) — the row-cell counterpart
 * of `addListBlade`.
 */
export function addListCellToRow<T>(
    row: RowApi,
    model: Model<T>,
    params: Partial<ListBladeParams<T>>,
    cleanup: (d: Destructor) => void,
) {
    const blade = row.addCell(configListBlade<T>(params, model.getValue)) as ListBladeApi<T>;
    wireBlade(blade, model, cleanup);
    return blade;
}

/**
 * Wires an already-added `button` blade as a clickable 🔒/🔓 lock indicator for `lockedProp`. A
 * real button rather than the earlier `text`-blade approach: a `text` blade is an editable input,
 * so clicking it (to toggle the lock) also drops a text caret into the field — there is no
 * legitimate typing to do there, only noise. A button has no such caret and no keyboard-editable
 * value to round-trip, so unlike the old `text` version this needs no `wireBlade`/`parse` path at
 * all — `button.title` is simply the glyph.
 *
 * Note for history: an earlier `text`-blade version tried `disabled: true` to suppress editing,
 * but Tweakpane's base CSS sets `pointer-events: none` on any blade carrying the `tp-v-disabled`
 * class (`.tp-rotv.tp-v-disabled,.tp-rotv .tp-v-disabled {pointer-events:none}`), which made the
 * control unclickable by real pointer input while a synthetic `dispatchEvent('click')` still
 * invoked it directly (bypassing hit-testing/CSS entirely) — that's why an earlier e2e version
 * passed while being dead in a real browser. A button has no `disabled`-CSS trap to fall into.
 */
function wireLockButton(button: ButtonApi, lockedProp: Model<boolean>, cleanup: (d: Destructor) => void) {
    const glyph = () => (lockedProp.getValue() ? '🔒' : '🔓');
    button.element.classList.add('sw-lock-cell');
    button.title = glyph();
    button.on('click', () => {
        void lockedProp.setValue?.(!lockedProp.getValue());
    });
    cleanup(
        lockedProp.onChange(() => {
            button.title = glyph();
        }),
    );
    cleanup(() => button.dispose());
    return button;
}

/**
 * Add a clickable lock-indicator cell to a table row: a compact 🔒/🔓 button that toggles
 * `lockedProp` on click. Tweakpane's built-in `button` view is itself a blade plugin (the same
 * kind `RowApi.addCell` resolves for text/slider/list), so it can sit in a row cell — unlike a
 * bound `checkbox` input, which `addCell` can't place at all.
 */
export function addLockCellToRow(row: RowApi, lockedProp: Model<boolean>, cleanup: (d: Destructor) => void) {
    const button = row.addCell({ view: 'button', title: '', width: '28px' }) as ButtonApi;
    return wireLockButton(button, lockedProp, cleanup);
}

/**
 * Add a clickable 🔒/🔓 lock button as its own folder-level blade — for the handful of tweakable
 * widgets that can't be expressed as a `tweakpane-table` cell at all (camera-ring dials, the
 * velocity point2d drag pad): those are Tweakpane *binding* plugins (`addBinding`), and
 * `RowApi.addCell` only resolves blade-view plugins, the same restriction `addLockCellToRow`
 * works around for text/slider/list. Kept as a sibling blade next to the widget it locks rather
 * than a `tweakpane-table` row.
 */
export function addLockBlade(guiFolder: FolderApi, lockedProp: Model<boolean>, cleanup: (d: Destructor) => void) {
    const button = guiFolder.addButton({ label: 'lock', title: '' });
    return wireLockButton(button, lockedProp, cleanup);
}
