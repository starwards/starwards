import $ from 'jquery';
import { EventEmitter } from 'eventemitter3';
import { ResizeSensor } from 'css-element-queries';

export type EventType = 'resize' | 'destroy';

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
