import { EventEmitter } from 'eventemitter3';
import { ResizeSensor } from 'css-element-queries';

export type EventType = 'resize' | 'destroy';

export type WidgetContainer = ReturnType<typeof wrapWidgetContainer>;
type Size = { width: number; height: number };
export function wrapWidgetContainer(element: JQuery<HTMLElement>) {
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
