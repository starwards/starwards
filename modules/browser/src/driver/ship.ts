import {
    BaseApi,
    BaseEventsApi,
    NumberMapDriver,
    addEventsApi,
    wrapIteratorStateProperty,
    wrapNormalNumericProperty,
    wrapNumericProperty,
    wrapStateProperty,
    wrapStringStateProperty,
} from './utils';
import { GameRoom, ShipDirection, ShipState, shipProperties } from '@starwards/model';

import EventEmitter from 'eventemitter3';
import { noop } from 'ts-essentials';
import { waitForEvents } from './async-utils';

function wireEvents(state: ShipState) {
    const events = new EventEmitter();
    state.onChange = (changes) => {
        for (const { field, value } of changes) {
            events.emit(field, value);
        }
    };
    events.once('constants', () => {
        state.constants.onChange = (value: number, key: string) => {
            events.emit('constants.' + key, value);
            events.emit('constants');
        };
    });
    state.position.onChange = (_) => events.emit('position', state.position);
    state.velocity.onChange = (_) => events.emit('velocity', state.velocity);
    events.once('chainGun', () => {
        state.chainGun.onChange = (changes) => {
            for (const { field, value } of changes) {
                events.emit(`chainGun.${field}`, value);
            }
        };
        state.chainGun.constants.onChange = (value: number, key: string) => {
            events.emit('chainGun.constants.' + key, value);
            events.emit('chainGun.constants');
        };
    });
    events.once('smartPilot', () => {
        state.smartPilot.onChange = (changes) => {
            for (const { field, value } of changes) {
                events.emit(`smartPilot.${field}`, value);
            }
        };
        state.smartPilot.maneuvering.onChange = (_) =>
            events.emit('smartPilot.maneuvering', state.smartPilot.maneuvering);
    });
    events.once('thrusters', () => {
        state.thrusters.onAdd = (thruster, key) => {
            thruster.onChange = (changes) => {
                for (const { field, value } of changes) {
                    events.emit(`thrusters.${key}.${field}`, value);
                }
            };
            thruster.constants.onChange = (value: number, constKey: string) => {
                events.emit(`thrusters.${key}.constants.${constKey}`, value);
                events.emit(`thrusters.${key}.constants`);
            };
        };
        state.thrusters.onRemove = () => {
            events.emit(`armor`);
        };
    });
    events.once('armor', () => {
        state.armor.onChange = (changes) => {
            for (const { field, value } of changes) {
                events.emit(`armor.${field}`, value);
            }
        };
        state.armor.constants.onChange = (value: number, key: string) => {
            events.emit('armor.constants.' + key, value);
            events.emit('armor.constants');
        };
        state.armor.armorPlates.onAdd = (plate, key) => {
            events.emit(`armor`);
            plate.onChange = (changes) => {
                for (const { field, value } of changes) {
                    events.emit(`armor.${key}.${field}`, value);
                    events.emit(`armor`);
                }
            };
        };
        state.armor.armorPlates.onRemove = () => {
            events.emit(`armor`);
        };
    });
    return events;
}

export type ThrusterDriver = {
    index: number;
    broken: BaseApi<boolean>;
    angle: BaseEventsApi<ShipDirection>;
};
export class ThrustersDriver {
    public numThrusters = wrapNumericProperty(this.shipRoom, shipProperties.numThrusters);
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
                    `thrusters.${index}.angle`
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

const NO_EVENT = 'never';
export class ArmorDriver {
    public numPlates = addEventsApi(
        wrapStateProperty(this.shipRoom, shipProperties.numPlates, undefined),
        this.events,
        NO_EVENT
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
        'armor'
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
                    `armor.${index}.health`
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
function wireCommands(shipRoom: GameRoom<'ship'>, events: EventEmitter) {
    return {
        armor: new ArmorDriver(shipRoom, events),
        thrusters: new ThrustersDriver(shipRoom, events),
        constants: new NumberMapDriver(shipRoom, shipProperties.constants),
        chainGunConstants: new NumberMapDriver(shipRoom, shipProperties.chainGunConstants),
        rotationCommand: wrapNumericProperty(shipRoom, shipProperties.rotationCommand),
        shellSecondsToLive: wrapNumericProperty(shipRoom, shipProperties.shellSecondsToLive),
        shellRange: wrapNumericProperty(shipRoom, shipProperties.shellRange),
        rotation: wrapNumericProperty(shipRoom, shipProperties.rotation),
        strafeCommand: wrapNumericProperty(shipRoom, shipProperties.strafeCommand),
        boostCommand: wrapNumericProperty(shipRoom, shipProperties.boostCommand),
        strafe: wrapNumericProperty(shipRoom, shipProperties.strafe),
        boost: wrapNumericProperty(shipRoom, shipProperties.boost),
        energy: wrapNumericProperty(shipRoom, shipProperties.energy),
        afterBurnerFuel: wrapNumericProperty(shipRoom, shipProperties.afterBurnerFuel),
        turnSpeed: wrapNumericProperty(shipRoom, shipProperties.turnSpeed),
        angle: wrapNumericProperty(shipRoom, shipProperties.angle),
        speedDirection: wrapNumericProperty(shipRoom, shipProperties.velocityAngle),
        speed: wrapNumericProperty(shipRoom, shipProperties.speed),
        chainGunCooldown: wrapNumericProperty(shipRoom, shipProperties.chainGunCoolDown),
        chainGunShellSecondsToLive: wrapNumericProperty(shipRoom, shipProperties.shellSecondsToLive),
        rotationTargetOffset: wrapNormalNumericProperty(shipRoom, shipProperties.rotationTargetOffset),
        afterBurner: wrapNormalNumericProperty(shipRoom, shipProperties.afterBurner),
        antiDrift: wrapNormalNumericProperty(shipRoom, shipProperties.antiDrift),
        breaks: wrapNormalNumericProperty(shipRoom, shipProperties.breaks),
        targeted: wrapStringStateProperty(shipRoom, shipProperties.targeted),
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
    const events = wireEvents(shipRoom.state);
    const pendingEvents = [];
    if (!shipRoom.state.chainGun) {
        pendingEvents.push('chainGun');
    }
    if (!shipRoom.state.constants) {
        pendingEvents.push('constants');
    }
    if (!shipRoom.state.thrusters) {
        pendingEvents.push('thrusters');
    }
    if (!shipRoom.state.thrusters) {
        pendingEvents.push('armor');
    }
    await waitForEvents(events, pendingEvents);
    const driver = newShipDriverObj(shipRoom, events);
    return driver;
}
