import { Destructors, type JsonStringPointer, RoomEventEmitter, getJsonPointer, getRange } from '@starwards/core';

import { Primitive } from 'colyseus-events';
import { Schema } from '@colyseus/schema';

interface Driver {
    readonly state: Schema;
    events: RoomEventEmitter;
    sendJsonCmd(pointerStr: string, value: Primitive): void;
}

export type Callback = () => void;
export type OnChange = (cb: Callback) => () => void;

export function aggregate<T>(underlyingProps: { onChange: OnChange }[], getValue: () => T) {
    return {
        onChange: (cb: () => unknown) => abstractOnChange(underlyingProps, getValue, cb),
        getValue,
    };
}

export function abstractOnChange(
    underlyingProps: { onChange: OnChange }[],
    getValue: () => unknown,
    cb: () => unknown,
) {
    const d = new Destructors();
    let lastValue = getValue();
    for (const property of underlyingProps) {
        d.add(
            property.onChange(() => {
                const newValue = getValue();
                if (newValue !== lastValue) {
                    lastValue = newValue;
                    cb();
                }
            }),
        );
    }
    return d.destroy;
}

export function propertyStub<T>(initialValue: T) {
    let value = initialValue;
    const callbacks: Callback[] = [];
    const getValue = () => value;
    const setValue = (newValue: T) => {
        if (value !== newValue) {
            value = newValue;
            for (const cb of callbacks) {
                cb();
            }
        }
    };
    const onChange: OnChange = (cb: Callback) => {
        callbacks.push(cb);
        return () => {
            callbacks.splice(callbacks.indexOf(cb), 1);
        };
    };
    return { getValue, setValue, onChange };
}

export function readProp<T>(driver: Driver, pointerStr: JsonStringPointer) {
    const pointer = getJsonPointer(pointerStr);
    if (!pointer) {
        throw new Error(`Illegal json path:${pointerStr}`);
    }
    const getValue = () => pointer.get(driver.state) as T | undefined;
    const onChange: OnChange = (cb: () => unknown) => {
        let lastValue = getValue();
        const listener = () => {
            const newValue = getValue();
            if (newValue !== lastValue) {
                lastValue = newValue;
                cb();
            }
        };
        driver.events.on(pointerStr, listener);
        return () => driver.events.off(pointerStr, listener);
    };
    return { pointer, getValue, onChange };
}

export function readWriteProp<T extends Primitive>(driver: Driver, pointerStr: JsonStringPointer) {
    return {
        ...readProp<T>(driver, pointerStr),
        ...writeProp(driver, pointerStr),
    };
}

export function writeProp<T extends Primitive>(driver: Driver, pointerStr: string) {
    return { setValue: (value: T) => driver.sendJsonCmd(pointerStr, value) };
}

/** Fans a single trigger out to several JSON pointers — e.g. one fire key driving every mount. */
export function writeAllProp<T extends Primitive>(driver: Driver, pointerStrs: string[]) {
    return { setValue: (value: T) => pointerStrs.forEach((pointerStr) => driver.sendJsonCmd(pointerStr, value)) };
}

export function readWriteNumberProp(driver: Driver, pointerStr: JsonStringPointer) {
    const api = readWriteProp<number>(driver, pointerStr);
    return { ...api, range: getRange(driver.state, api.pointer) };
}

/**
 * Fans a range control out to several JSON pointers — e.g. one shell-range
 * hotkey driving every chain-gun mount. Reads/tracks the first pointer (all
 * mounts share the same @range) but writes every step to all of them, so a
 * multi-mount hull's mounts move together instead of only mount 0 responding.
 */
export function readWriteAllNumberProp(driver: Driver, pointerStrs: JsonStringPointer[]) {
    const props = pointerStrs.map((pointerStr) => readWriteProp<number>(driver, pointerStr));
    const [first] = props;
    if (!first) {
        throw new Error('readWriteAllNumberProp requires at least one pointer');
    }
    return {
        ...aggregate(props, first.getValue),
        setValue: (value: number) => props.forEach((prop) => prop.setValue(value)),
        range: getRange(driver.state, first.pointer),
    };
}

export function readWriteVec2Prop(driver: Driver, pointerStr: JsonStringPointer) {
    const xProp = readWriteProp<number>(driver, `${pointerStr}/x`);
    const yProp = readWriteProp<number>(driver, `${pointerStr}/y`);
    return {
        ...aggregate([xProp, yProp], () => {
            const x = xProp.getValue();
            const y = yProp.getValue();
            return x === undefined || y === undefined ? undefined : { x, y };
        }),
        setValue: (v: { x: number; y: number }) => {
            xProp.setValue(v.x);
            yProp.setValue(v.y);
        },
    };
}
export function readNumberProp(driver: Driver, pointerStr: JsonStringPointer) {
    const api = readProp<number>(driver, pointerStr);
    return { ...api, range: getRange(driver.state, api.pointer) };
}
