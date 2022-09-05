export type EventMap = Record<string, unknown>;

export type EventKey<T extends EventMap> = string & keyof T;
export type EventReceiver<T> = (params: T) => unknown;

export interface EventEmitter<T extends EventMap> {
    on<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    once<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    off<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    emit<K extends EventKey<T>>(eventName: K, params: T[K]): unknown;
}
