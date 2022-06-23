import {
    Destructor,
    GameRoom,
    IteratorStatePropertyCommand,
    MappedPropertyCommand,
    NormalNumericStateProperty,
    NumericStateProperty,
    RoomName,
    State,
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
export type ReadApi<T> = {
    getValue: () => T;
};
export type EventApi = {
    onChange: (cb: () => unknown) => Destructor;
};
export type BaseEventsApi<T> = BaseApi<T> & EventApi;
export type TriggerApi = {
    getValue: () => string;
    setValue: (v: boolean) => unknown;
};

export function wrapStateProperty<T, R extends RoomName, P>(
    shipRoom: GameRoom<R>,
    p: StateProperty<T, State<R>, P>,
    path: P
): BaseApi<T> {
    return {
        getValue: () => p.getValue(shipRoom.state, path),
        setValue: isStatePropertyCommand(p) ? cmdSender(shipRoom, p, path) : noop,
    };
}

export function addEventsApi<T, A extends ReadApi<T>>(api: A, events: EventEmitter, eventName: string): A & EventApi {
    return {
        ...api,
        onChange: (cb: () => unknown) => {
            let lastValue = api.getValue();
            const listener = () => {
                const newValue = api.getValue();
                if (newValue !== lastValue) {
                    lastValue = newValue;
                    cb();
                }
            };
            events.on(eventName, listener);
            return () => events.off(eventName, listener);
        },
    };
}

export function wrapNumericProperty<R extends RoomName, P>(
    shipRoom: GameRoom<R>,
    p: NumericStateProperty<State<R>, P>,
    path: P
): DriverNumericApi {
    const range = typeof p.range === 'function' ? p.range(shipRoom.state, path) : p.range;
    return {
        getValue: () => p.getValue(shipRoom.state, path),
        range,
        setValue: isStatePropertyCommand(p) ? cmdSender(shipRoom, p, path) : noop,
    };
}

export function wrapNormalNumericProperty<R extends RoomName, P>(
    shipRoom: GameRoom<R>,
    p: NormalNumericStateProperty<State<R>, P>,
    path: P
): DriverNormalNumericApi {
    let setValue: (v: number | boolean) => unknown = noop;
    if (isStatePropertyCommand(p)) {
        const sender = cmdSender(shipRoom, p, path);
        setValue = (v: number | boolean) => {
            if (v === true) return sender(1);
            if (v === false) return sender(0);
            return sender(v);
        };
    }
    return {
        getValue: () => p.getValue(shipRoom.state, path),
        range: [0, 1],
        setValue,
    };
}

export function wrapIteratorStateProperty<R extends RoomName, P>(
    shipRoom: GameRoom<R>,
    p: IteratorStatePropertyCommand<State<R>, P>,
    path: P
): TriggerApi {
    return {
        getValue: () => p.getValue(shipRoom.state, path),
        setValue: cmdSender(shipRoom, p, path),
    };
}

export function wrapStringStateProperty<R extends RoomName, P>(
    shipRoom: GameRoom<R>,
    p: StateProperty<string, State<R>, P>,
    path: P
): TriggerApi {
    return {
        getValue: () => p.getValue(shipRoom.state, path),
        setValue: isStatePropertyCommand(p) ? cmdSender(shipRoom, p, undefined) : noop,
    };
}

export class NumberMapDriver<R extends RoomName, P> {
    private _map: MapSchema<number>;
    public map: Map<string, number>;
    constructor(private shipRoom: GameRoom<R>, private p: MappedPropertyCommand<State<R>, P>, path: P) {
        this.map = this._map = p.getValue(shipRoom.state, path);
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
