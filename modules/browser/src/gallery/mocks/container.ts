import $ from 'jquery';
import { EventEmitter } from 'eventemitter3';

export type EventType = 'resize' | 'destroy';

export interface MockWidgetContainer {
    on(type: EventType, fn: () => unknown): void;
    off(type: EventType, fn: () => unknown): void;
    readonly width: number;
    readonly height: number;
    getElement(): JQuery<HTMLElement>;
}

export function createMockContainer(element: HTMLElement, width = 800, height = 600): MockWidgetContainer {
    const events = new EventEmitter<EventType>();
    const jqElement = $(element);

    // Set fixed dimensions
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.position = 'relative';

    return {
        on(type: EventType, fn: () => unknown) {
            events.on(type, fn);
        },
        off(type: EventType, fn: () => unknown) {
            events.off(type, fn);
        },
        get width() {
            return width;
        },
        get height() {
            return height;
        },
        getElement() {
            return jqElement;
        },
    };
}
