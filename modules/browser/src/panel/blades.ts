import {
    BladeApi,
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
 * Wires a plain `text`-blade instance (already added to either a folder or a table row) as a
 * clickable 🔒/🔓 lock indicator for `lockedProp`. A `text` blade rather than a checkbox
 * binding — see `addLockCellToRow` for why a checkbox can't be used for the row-cell case;
 * `addLockBlade` reuses the same rendering for consistency (and, incidentally, the same
 * always-hit-testable click target) even where a checkbox binding would have been possible.
 *
 * Deliberately NOT `disabled: true`: Tweakpane's base CSS sets `pointer-events: none` on any
 * blade carrying the `tp-v-disabled` class (`.tp-rotv.tp-v-disabled,.tp-rotv .tp-v-disabled
 * {pointer-events:none}`), which made the click listener below completely unreachable by real
 * pointer input — a synthetic `dispatchEvent('click')` still invoked it directly (bypassing
 * hit-testing/CSS entirely), which is exactly why an earlier e2e version of this control passed
 * while being dead in a real browser. Nothing here wires keyboard input back to `lockedProp` (no
 * `wireBlade`/`parse`-to-value round trip is set up), so leaving the cell technically editable
 * has no functional effect — a stray keystroke never reaches the lock state, and the next
 * `lockedProp.onChange` refresh overwrites the displayed glyph regardless.
 */
function wireLockGlyph(blade: BladeGuiApi<string>, lockedProp: Model<boolean>, cleanup: (d: Destructor) => void) {
    const glyph = () => (lockedProp.getValue() ? '🔒' : '🔓');
    blade.element.classList.add('sw-lock-cell');
    blade.element.addEventListener('click', () => {
        void lockedProp.setValue?.(!lockedProp.getValue());
    });
    cleanup(
        lockedProp.onChange(() => {
            blade.value = glyph();
        }),
    );
    cleanup(() => blade.dispose());
    return blade;
}

/**
 * Add a clickable lock-indicator cell to a table row: a compact 🔒/🔓 readout that toggles
 * `lockedProp` on click. A plain `text` cell rather than a checkbox binding — `RowApi.addCell`
 * only resolves *blade*-view plugins (text/slider/list/separator), not the binding-based
 * `checkbox` input Tweakpane normally renders for a bound boolean, so a checkbox cannot be
 * placed in a table row at all.
 */
export function addLockCellToRow(row: RowApi, lockedProp: Model<boolean>, cleanup: (d: Destructor) => void) {
    const blade = row.addCell(
        configTextBlade({ width: '28px' }, () => (lockedProp.getValue() ? '🔒' : '🔓')),
    ) as BladeGuiApi<string>;
    return wireLockGlyph(blade, lockedProp, cleanup);
}

/**
 * Add a clickable 🔒/🔓 lock indicator as its own folder-level blade — for the handful of
 * tweakable widgets that can't be expressed as a `tweakpane-table` cell at all (camera-ring
 * dials, the velocity point2d drag pad): those are Tweakpane *binding* plugins (`addBinding`),
 * and `RowApi.addCell` only resolves blade-view plugins, the same restriction `addLockCellToRow`
 * works around for text/slider/list. Kept as a sibling blade next to the widget it locks rather
 * than a `tweakpane-table` row.
 */
export function addLockBlade(guiFolder: FolderApi, lockedProp: Model<boolean>, cleanup: (d: Destructor) => void) {
    const blade = guiFolder.addBlade(
        configTextBlade({ label: 'lock' }, () => (lockedProp.getValue() ? '🔒' : '🔓')),
    ) as BladeGuiApi<string>;
    return wireLockGlyph(blade, lockedProp, cleanup);
}
