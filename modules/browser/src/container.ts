import $ from 'jquery';
import { EventEmitter } from 'eventemitter3';
import { ResizeSensor } from 'css-element-queries';

type EventType = 'resize' | 'destroy';

export type WidgetContainer = ReturnType<typeof wrapWidgetContainer>;
type Size = { width: number; height: number };

export enum HPos {
    LEFT,
    MIDDLE,
    RIGHT,
}
export enum VPos {
    TOP,
    MIDDLE,
    BOTTOM,
}

export function wrapRootWidgetContainer(element: JQuery<HTMLElement>) {
    const wContainer = wrapWidgetContainer(element);
    return {
        ...wContainer,
        subContainer(v: VPos, h: HPos): WidgetContainer {
            const divElement = $(
                `<div style="position: absolute; ${vPos(v)} ${hPos(h)} transform: translate(${trans(h)}, ${trans(
                    v,
                )});" />'`,
            );
            element.append(divElement);
            return wrapWidgetContainer(divElement);
        },
    };
}
export const GRID_MARGIN = 14;
const GRID_GAP = 12;

type SlotOptions = {
    /** The one slot in its column that gives way (and scrolls) when the column is too short. */
    scroll?: boolean;
    /** Exact slot width in pixels; the slot is centered in its column. */
    width?: number;
    /** Push this slot (and those after it) to the column's bottom edge. */
    bottom?: boolean;
    /** Stretch across the whole column instead of hugging its content. */
    fill?: boolean;
};

/**
 * A three-column station grid over the root container. Slots stack top to bottom inside their
 * column and never overlap: a slot whose content is taller than the room left scrolls inside
 * itself. Slots appear in the order they are requested; draw order is independent of that,
 * so a pane that must receive clicks can still be drawn last.
 */
export function stationGrid(root: ReturnType<typeof wrapRootWidgetContainer>, widths: { left: number; right: number }) {
    const element = root.getElement();
    const column = (css: string) => {
        const col = $(
            `<div style="position: absolute; top: ${GRID_MARGIN}px; bottom: ${GRID_MARGIN}px; display: flex; flex-direction: column; gap: ${GRID_GAP}px; pointer-events: none; ${css}" />`,
        );
        element.append(col);
        return (options: SlotOptions = {}) => {
            const slot = $(
                `<div style="pointer-events: auto; min-height: 0; overflow-x: ${options.scroll ? 'hidden' : 'visible'}; overflow-y: ${
                    options.scroll ? 'auto' : 'visible'
                }; scrollbar-width: none; flex: 0 ${options.scroll ? '1' : '0'} auto; ${
                    options.bottom ? 'margin-top: auto;' : ''
                } ${options.width ? `width: ${options.width}px;` : ''} ${
                    options.fill && !options.width ? 'align-self: stretch;' : 'align-self: center;'
                }" />`,
            );
            col.append(slot);
            return wrapWidgetContainer(slot);
        };
    };
    const side = (edge: 'left' | 'right', width: number) => {
        const slot = column(`${edge}: ${GRID_MARGIN}px; width: ${width}px;`);
        return (options: SlotOptions = {}) => slot({ fill: true, ...options });
    };
    return {
        left: side('left', widths.left),
        right: side('right', widths.right),
        center: column(
            `left: ${widths.left + GRID_MARGIN * 2}px; right: ${widths.right + GRID_MARGIN * 2}px; align-items: stretch;`,
        ),
    };
}

function wrapWidgetContainer(element: JQuery<HTMLElement>) {
    const events = new EventEmitter<EventType>();
    let size = { width: element.width() || 0, height: element.height() || 0 };
    new ResizeSensor(element[0], (s: Size) => {
        size = s;
        events.emit('resize');
    });

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (let index = 0; index < mutation.removedNodes.length; index++) {
                    const el = mutation.removedNodes[index];
                    if (el === element[0]) {
                        events.emit('destroy');
                    }
                }
            }
        }
    });
    observer.observe(element.parent()[0], { childList: true });

    return {
        on(type: EventType, fn: () => unknown) {
            events.on(type, fn);
        },
        off(type: EventType, fn: () => unknown) {
            events.off(type, fn);
        },
        get width() {
            return size.width;
        },
        get height() {
            return size.height;
        },
        getElement() {
            return element;
        },
    };
}

function vPos(v: VPos) {
    if (v === VPos.TOP) {
        return `top:0;`;
    } else if (v === VPos.MIDDLE) {
        return `top:50%;`;
    } else return `bottom:0;`;
}
function trans(v: VPos | HPos) {
    if (v === VPos.MIDDLE || v === HPos.MIDDLE) {
        return `-50%`;
    } else return `0`;
}
function hPos(v: HPos) {
    if (v === HPos.LEFT) {
        return `left:0;`;
    } else if (v === HPos.MIDDLE) {
        return `left:50%;`;
    } else return `right:0;`;
}
