import {
    BaseApi,
    BaseEventsApi,
    DriverNormalNumericApi,
    DriverNumericApi,
    EventApi,
    addEventsApi,
    wrapIteratorStateProperty,
    wrapNormalNumericProperty,
    wrapNumericProperty,
    wrapStateProperty,
    wrapStringStateProperty,
} from './utils';
import { GameRoom, RoomName, State } from '..';
import { MappedPropertyCommand, cmdSender } from '../api';
import { ShipDirection, shipProperties } from '../ship';

import EventEmitter from 'eventemitter3';
import { noop } from 'ts-essentials';
import { waitForEvents } from './async-utils';
import { wireEvents } from './events';

export type ThrusterDriver = {
    index: number;
    broken: BaseApi<boolean>;
    angle: BaseEventsApi<ShipDirection>;
    angleError: DriverNumericApi & EventApi;
    availableCapacity: DriverNormalNumericApi & EventApi;
};
export class ThrustersDriver {
    public numThrusters = wrapNumericProperty(this.shipRoom, shipProperties.numThrusters, undefined);
    private cache = new Map<number, ThrusterDriver>();
    constructor(private shipRoom: GameRoom<'ship'>, private events: EventEmitter) {}

    getApi(index: number) {
        const result = this.cache.get(index);
        if (result) {
            return result;
        } else {
            const newValue: ThrusterDriver = {
                index,
                broken: wrapStateProperty(this.shipRoom, shipProperties.thrusterBroken, index),
                angle: addEventsApi(
                    wrapStateProperty(this.shipRoom, shipProperties.thrusterAngle, index),
                    this.events,
                    `/thrusters/${index}/angle`
                ),
                angleError: addEventsApi(
                    wrapNumericProperty(this.shipRoom, shipProperties.thrusterAngleError, index),
                    this.events,
                    `/thrusters/${index}/angleError`
                ),
                availableCapacity: addEventsApi(
                    wrapNormalNumericProperty(this.shipRoom, shipProperties.thrusterAvailableCapacity, index),
                    this.events,
                    `/thrusters/${index}/availableCapacity`
                ),
            };
            this.cache.set(index, newValue);
            return newValue;
        }
    }
    public *[Symbol.iterator](): IterableIterator<ThrusterDriver> {
        for (let i = 0; i < this.numThrusters.getValue(); i++) {
            yield this.getApi(i);
        }
    }
}

export type PlateDriver = {
    index: number;
    health: BaseEventsApi<ShipDirection>;
};

export class ArmorDriver {
    public numPlates = addEventsApi(
        wrapStateProperty(this.shipRoom, shipProperties.numPlates, undefined),
        this.events,
        '/armor/armorPlates'
    );
    public numHealthyPlates = addEventsApi(
        {
            getValue: () => {
                let count = 0;
                for (const plate of this.shipRoom.state.armor.armorPlates) {
                    if (plate.health > 0) {
                        count++;
                    }
                }
                return count;
            },
            setValue: noop,
        },
        this.events,
        '/armor/armorPlates'
    );
    private cache = new Map<number, PlateDriver>();
    constructor(private shipRoom: GameRoom<'ship'>, private events: EventEmitter) {}

    getApi(index: number) {
        const result = this.cache.get(index);
        if (result) {
            return result;
        } else {
            const newValue: PlateDriver = {
                index,
                health: addEventsApi(
                    wrapStateProperty(this.shipRoom, shipProperties.plateHealth, index),
                    this.events,
                    `/armor/armorPlates`
                ),
            };
            this.cache.set(index, newValue);
            return newValue;
        }
    }
    public *[Symbol.iterator](): IterableIterator<PlateDriver> {
        for (let i = 0; i < this.numPlates.getValue(); i++) {
            yield this.getApi(i);
        }
    }
}

export class NumberMapDriver<R extends RoomName, P, K extends string> {
    public map: Map<K, number>;
    constructor(
        private shipRoom: GameRoom<R>,
        private p: MappedPropertyCommand<State<R>, P, K>,
        path: P,
        private events: EventEmitter,
        private eventName: string
    ) {
        this.map = p.getValue(shipRoom.state, path);
    }
    private getValue(name: K) {
        const val = this.map.get(name);
        if (val === undefined) {
            throw new Error(`missing constant value: ${name}`);
        }
        return val;
    }

    get fields() {
        return this.map.keys();
    }
    onChange(cb: () => unknown) {
        this.events.on(this.eventName, cb);
    }
    getApi(name: K): BaseApi<number> {
        const sender = cmdSender(this.shipRoom, this.p, undefined);
        return {
            getValue: () => this.getValue(name),
            setValue: (value: number) => sender([name, value]),
        };
    }
}

function wireCommands(shipRoom: GameRoom<'ship'>, events: EventEmitter) {
    return {
        armor: new ArmorDriver(shipRoom, events),
        thrusters: new ThrustersDriver(shipRoom, events),
        constants: new NumberMapDriver(shipRoom, shipProperties.constants, undefined, events, '/modelParams'),
        chainGunConstants: new NumberMapDriver(
            shipRoom,
            shipProperties.chainGunConstants,
            undefined,
            events,
            '/chainGun/modelParams'
        ),
        rotationCommand: wrapNumericProperty(shipRoom, shipProperties.rotationCommand, undefined),
        shellSecondsToLive: wrapNumericProperty(shipRoom, shipProperties.shellSecondsToLive, undefined),
        shellRange: wrapNumericProperty(shipRoom, shipProperties.shellRange, undefined),
        rotation: wrapNumericProperty(shipRoom, shipProperties.rotation, undefined),
        strafeCommand: wrapNumericProperty(shipRoom, shipProperties.strafeCommand, undefined),
        boostCommand: wrapNumericProperty(shipRoom, shipProperties.boostCommand, undefined),
        strafe: wrapNumericProperty(shipRoom, shipProperties.strafe, undefined),
        boost: wrapNumericProperty(shipRoom, shipProperties.boost, undefined),
        energy: wrapNumericProperty(shipRoom, shipProperties.energy, undefined),
        afterBurnerFuel: wrapNumericProperty(shipRoom, shipProperties.afterBurnerFuel, undefined),
        turnSpeed: wrapNumericProperty(shipRoom, shipProperties.turnSpeed, undefined),
        angle: wrapNumericProperty(shipRoom, shipProperties.angle, undefined),
        speedDirection: wrapNumericProperty(shipRoom, shipProperties.velocityAngle, undefined),
        speed: wrapNumericProperty(shipRoom, shipProperties.speed, undefined),
        chainGunCooldown: wrapNumericProperty(shipRoom, shipProperties.chainGunCoolDown, undefined),
        chainGunShellSecondsToLive: wrapNumericProperty(shipRoom, shipProperties.shellSecondsToLive, undefined),
        rotationTargetOffset: wrapNormalNumericProperty(shipRoom, shipProperties.rotationTargetOffset, undefined),
        afterBurner: wrapNormalNumericProperty(shipRoom, shipProperties.afterBurner, undefined),
        antiDrift: wrapNormalNumericProperty(shipRoom, shipProperties.antiDrift, undefined),
        breaks: wrapNormalNumericProperty(shipRoom, shipProperties.breaks, undefined),
        targeted: wrapStringStateProperty(shipRoom, shipProperties.targeted, undefined),
        chainGunIsFiring: wrapIteratorStateProperty(shipRoom, shipProperties.chainGunIsFiring, undefined),
        target: wrapIteratorStateProperty(shipRoom, shipProperties.target, undefined),
        clearTarget: wrapIteratorStateProperty(shipRoom, shipProperties.clearTarget, undefined),
        rotationMode: wrapIteratorStateProperty(shipRoom, shipProperties.rotationMode, undefined),
        maneuveringMode: wrapIteratorStateProperty(shipRoom, shipProperties.maneuveringMode, undefined),
        faction: wrapStateProperty(shipRoom, shipProperties.faction, undefined),
    };
}

export type ShipDriver = ReturnType<typeof newShipDriverObj>;

function newShipDriverObj(shipRoom: GameRoom<'ship'>, events: EventEmitter) {
    const commands = wireCommands(shipRoom, events);
    return {
        events,
        id: shipRoom.state.id,
        get state() {
            return shipRoom.state;
        },
        ...commands,
    };
}

export async function ShipDriver(shipRoom: GameRoom<'ship'>) {
    const events = wireEvents(shipRoom.state, new EventEmitter());
    const pendingEvents = [];
    if (!shipRoom.state.chainGun) {
        pendingEvents.push('/chainGun');
    }
    if (!shipRoom.state.modelParams) {
        pendingEvents.push('/modelParams');
    }
    if (!shipRoom.state.thrusters) {
        pendingEvents.push('/thrusters');
    }
    if (!shipRoom.state.armor) {
        pendingEvents.push('/armor');
    }
    await waitForEvents(events, pendingEvents);
    const driver = newShipDriverObj(shipRoom, events);
    return driver;
}
