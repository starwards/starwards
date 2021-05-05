import {
    GameRoom,
    IteratorStatePropertyCommand,
    MappedPropertyCommand,
    NormalNumericStateProperty,
    NumericStateProperty,
    ShipState,
    StateProperty,
    cmdSender,
    getConstant,
    isStatePropertyCommand,
} from '@starwards/model';

import { MapSchema } from '@colyseus/schema';

const noop = () => void 0;

export type DriverNumericApi = {
    range: [number, number];
    onChange: (v: number) => unknown;
    getValue: () => number;
};

export type DriverNormalNumericApi = {
    range: [0, 1];
    onChange: (v: number | boolean) => unknown;
    getValue: () => number;
};

export type TriggerApi = {
    getValue: () => string;
    onChange: (v: boolean) => unknown;
};

export function wrapNumericProperty(
    shipRoom: GameRoom<'ship'>,
    p: NumericStateProperty<ShipState, void>
): DriverNumericApi {
    const range = typeof p.range === 'function' ? p.range(shipRoom.state) : p.range;
    return {
        getValue: () => p.getValue(shipRoom.state),
        range,
        onChange: isStatePropertyCommand(p) ? cmdSender(shipRoom, p, undefined) : noop,
    };
}

export function wrapNormalNumericProperty(
    shipRoom: GameRoom<'ship'>,
    p: NormalNumericStateProperty<ShipState, void>
): DriverNormalNumericApi {
    let onChange: (v: number | boolean) => unknown;
    if (isStatePropertyCommand(p)) {
        const sender = cmdSender(shipRoom, p, undefined);
        onChange = (v: number | boolean) => {
            if (v === true) return sender(1);
            if (v === false) return sender(0);
            return sender(v);
        };
    } else {
        onChange = noop;
    }
    return {
        getValue: () => p.getValue(shipRoom.state),
        range: [0, 1],
        onChange,
    };
}
export function wrapIteratorStateProperty<P>(
    shipRoom: GameRoom<'ship'>,
    p: IteratorStatePropertyCommand<ShipState, P>,
    path: P
): TriggerApi {
    return {
        getValue: () => p.getValue(shipRoom.state, path),
        onChange: cmdSender(shipRoom, p, path),
    };
}

export function wrapStringStateProperty(
    shipRoom: GameRoom<'ship'>,
    p: StateProperty<string, ShipState, void>
): TriggerApi {
    return {
        getValue: () => p.getValue(shipRoom.state),
        onChange: isStatePropertyCommand(p) ? cmdSender(shipRoom, p, undefined) : noop,
    };
}

export class NumberMapDriver {
    private _map: MapSchema<number>;
    public map: Map<string, number>;
    constructor(private shipRoom: GameRoom<'ship'>, private p: MappedPropertyCommand<ShipState, void>) {
        this.map = this._map = p.getValue(shipRoom.state);
    }
    getApi(name: string): DriverNumericApi {
        const sender = cmdSender(this.shipRoom, this.p, undefined);
        const val = getConstant(this.map, name);
        return {
            getValue: () => getConstant(this.map, name),
            range: [val / 2, val * 2],
            onChange: (value: number) => sender([name, value]),
        };
    }
    set onAdd(cb: (name: string, api: DriverNumericApi) => unknown) {
        this._map.onAdd = (_: unknown, name: string) => cb(name, this.getApi(name));
    }
}
