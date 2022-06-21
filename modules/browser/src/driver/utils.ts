import {
    Destructor,
    GameRoom,
    IteratorStatePropertyCommand,
    MappedPropertyCommand,
    NormalNumericStateProperty,
    NumericStateProperty,
    ShipState,
    StateProperty,
    cmdSender,
    isStatePropertyCommand,
} from '@starwards/model';

import EventEmitter from 'eventemitter3';
import { MapSchema } from '@colyseus/schema';
import { noop } from 'ts-essentials';

export type DriverNumericApi = {
    range: [number, number];
    setValue: (v: number) => unknown;
    getValue: () => number;
};

export type DriverNormalNumericApi = {
    range: [0, 1];
    setValue: (v: number | boolean) => unknown;
    getValue: () => number;
};

export type BaseApi<T> = {
    getValue: () => T;
    setValue: (v: T) => unknown;
};

export type EventApi = {
    onChange: (cb: () => unknown) => Destructor;
};
export type BaseEventsApi<T> = BaseApi<T> & EventApi;
export type TriggerApi = {
    getValue: () => string;
    setValue: (v: boolean) => unknown;
};

export function wrapStateProperty<T, P>(
    shipRoom: GameRoom<'ship'>,
    p: StateProperty<T, ShipState, P>,
    path: P
): BaseApi<T> {
    return {
        getValue: () => p.getValue(shipRoom.state, path),
        setValue: isStatePropertyCommand(p) ? cmdSender(shipRoom, p, path) : noop,
    };
}

export function addEventsApi<T, A extends { getValue: () => T }>(
    api: A,
    events: EventEmitter,
    eventName: string
): A & EventApi {
    return {
        ...api,
        onChange: makeOnChange<T>(events, eventName, api.getValue),
    };
}

function makeOnChange<T>(events: EventEmitter, eventName: string, getValue: () => T) {
    return (cb: () => unknown) => {
        let lastValue = getValue();
        const listener = () => {
            const newValue = getValue();
            if (newValue !== lastValue) {
                lastValue = newValue;
                cb();
            }
        };
        events.on(eventName, listener);
        return () => events.off(eventName, listener);
    };
}

export function wrapNumericProperty(
    shipRoom: GameRoom<'ship'>,
    p: NumericStateProperty<ShipState, void>
): DriverNumericApi {
    const range = typeof p.range === 'function' ? p.range(shipRoom.state) : p.range;
    return {
        getValue: () => p.getValue(shipRoom.state),
        range,
        setValue: isStatePropertyCommand(p) ? cmdSender(shipRoom, p, undefined) : noop,
    };
}

export function wrapNormalNumericProperty(
    shipRoom: GameRoom<'ship'>,
    p: NormalNumericStateProperty<ShipState, void>
): DriverNormalNumericApi {
    let setValue: (v: number | boolean) => unknown = noop;
    if (isStatePropertyCommand(p)) {
        const sender = cmdSender(shipRoom, p, undefined);
        setValue = (v: number | boolean) => {
            if (v === true) return sender(1);
            if (v === false) return sender(0);
            return sender(v);
        };
    }
    return {
        getValue: () => p.getValue(shipRoom.state),
        range: [0, 1],
        setValue,
    };
}

export function wrapIteratorStateProperty<P>(
    shipRoom: GameRoom<'ship'>,
    p: IteratorStatePropertyCommand<ShipState, P>,
    path: P
): TriggerApi {
    return {
        getValue: () => p.getValue(shipRoom.state, path),
        setValue: cmdSender(shipRoom, p, path),
    };
}

export function wrapStringStateProperty(
    shipRoom: GameRoom<'ship'>,
    p: StateProperty<string, ShipState, void>
): TriggerApi {
    return {
        getValue: () => p.getValue(shipRoom.state),
        setValue: isStatePropertyCommand(p) ? cmdSender(shipRoom, p, undefined) : noop,
    };
}

export class NumberMapDriver {
    private _map: MapSchema<number>;
    public map: Map<string, number>;
    constructor(private shipRoom: GameRoom<'ship'>, private p: MappedPropertyCommand<ShipState, void>) {
        this.map = this._map = p.getValue(shipRoom.state);
    }
    private getValue(name: string) {
        const val = this.map.get(name);
        if (val === undefined) {
            throw new Error(`missing constant value: ${name}`);
        }
        return val;
    }

    getApi(name: string): BaseApi<number> {
        const sender = cmdSender(this.shipRoom, this.p, undefined);
        return {
            getValue: () => this.getValue(name),
            setValue: (value: number) => sender([name, value]),
        };
    }
    set onAdd(cb: (name: string, api: BaseApi<number>) => unknown) {
        this._map.onAdd = (_: unknown, name: string) => cb(name, this.getApi(name));
    }
}
