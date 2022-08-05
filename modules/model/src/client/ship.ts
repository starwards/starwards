import { EventEmitter, makeEventsEmitter } from './events';
import { Faction, GameRoom, RoomName } from '..';
import { SmartPilotMode, TargetedStatus } from '../ship';
import {
    makeOnChange,
    pointerBaseEventsApi,
    pointerBaseNumericEventsApi,
    pointerReadEventsApi,
    pointerReadNumericEventsApi,
    pointerWriteApi,
} from './utils';

import { JsonStringPointer } from 'json-ptr';
import { waitForEvents } from './async-utils';

export type ThrusterDriver = ReturnType<ThrustersDriver['makeDriver']>;
export class ThrustersDriver {
    private cache = new Map<number, ThrusterDriver>();
    constructor(private shipRoom: GameRoom<'ship'>, private events: EventEmitter) {}

    getApi(index: number): ThrusterDriver {
        const result = this.cache.get(index);
        if (result) {
            return result;
        } else {
            const newValue = this.makeDriver(index);
            this.cache.set(index, newValue);
            return newValue;
        }
    }

    private makeDriver(index: number) {
        return {
            index,
            broken: { getValue: () => this.shipRoom.state.thrusters[index].broken },
            angle: pointerBaseEventsApi<number>(this.shipRoom, this.events, `/thrusters/${index}/angle`),
            angleError: pointerBaseNumericEventsApi(this.shipRoom, this.events, `/thrusters/${index}/angleError`),
            availableCapacity: pointerBaseNumericEventsApi(
                this.shipRoom,
                this.events,
                `/thrusters/${index}/availableCapacity`
            ),
        };
    }

    public *[Symbol.iterator](): IterableIterator<ThrusterDriver> {
        for (let i = 0; i < this.shipRoom.state.thrusters.length; i++) {
            yield this.getApi(i);
        }
    }
}

export type PlateDriver = ReturnType<ArmorDriver['makePlateDriver']>;
export class ArmorDriver {
    public numPlates = pointerReadEventsApi<number>(this.shipRoom, this.events, '/armor/numberOfPlates');
    private countHealthyPlayes = () => {
        let count = 0;
        for (const plate of this.shipRoom.state.armor.armorPlates) if (plate.health > 0) count++;
        return count;
    };
    public numHealthyPlates = {
        getValue: this.countHealthyPlayes,
        onChange: makeOnChange(this.countHealthyPlayes, this.events, '/armor/armorPlates/*/health'),
    };
    private cache = new Map<number, PlateDriver>();
    constructor(private shipRoom: GameRoom<'ship'>, private events: EventEmitter) {}

    private makePlateDriver(index: number) {
        return {
            index,
            health: pointerBaseNumericEventsApi(this.shipRoom, this.events, `/armor/armorPlates/${index}/health`),
            maxHealth: pointerBaseNumericEventsApi(this.shipRoom, this.events, `/armor/armorPlates/${index}/maxHealth`),
        };
    }
    getApi(index: number): PlateDriver {
        const result = this.cache.get(index);
        if (result) {
            return result;
        } else {
            const newValue: PlateDriver = this.makePlateDriver(index);
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

export class NumberMapDriver<R extends RoomName, K extends string> {
    public mapApi = pointerBaseEventsApi<Map<K, number>>(this.shipRoom, this.events, this.pointerStr);
    constructor(private shipRoom: GameRoom<R>, private events: EventEmitter, private pointerStr: JsonStringPointer) {}
    get map(): Map<K, number> {
        return this.mapApi.getValue();
    }
    get fields() {
        return this.map.keys();
    }
    onChange(cb: () => unknown) {
        return this.mapApi.onChange(cb);
    }
    getApi(name: K) {
        return pointerBaseEventsApi<number>(this.shipRoom, this.events, this.pointerStr + '/' + name);
    }
}

export type ShipDriver = ReturnType<typeof newShipDriverObj>;

function newShipDriverObj(shipRoom: GameRoom<'ship'>, events: EventEmitter) {
    return {
        events,
        id: shipRoom.state.id,
        get state() {
            return shipRoom.state;
        },
        armor: new ArmorDriver(shipRoom, events),
        thrusters: new ThrustersDriver(shipRoom, events),
        constants: new NumberMapDriver(shipRoom, events, '/modelParams/params'),
        chainGunConstants: new NumberMapDriver(shipRoom, events, '/chainGun/modelParams/params'),
        rotationCommand: pointerBaseNumericEventsApi(shipRoom, events, `/smartPilot/rotation`),
        shellSecondsToLive: pointerReadNumericEventsApi(shipRoom, events, '/chainGun/shellSecondsToLive'),
        shellRange: pointerBaseNumericEventsApi(shipRoom, events, `/chainGun/shellRange`),
        rotation: pointerReadNumericEventsApi(shipRoom, events, `/rotation`),
        strafeCommand: pointerBaseNumericEventsApi(shipRoom, events, `/smartPilot/maneuvering/y`),
        boostCommand: pointerBaseNumericEventsApi(shipRoom, events, `/smartPilot/maneuvering/x`),
        strafe: pointerReadNumericEventsApi(shipRoom, events, `/strafe`),
        boost: pointerReadNumericEventsApi(shipRoom, events, `/boost`),
        energy: pointerReadNumericEventsApi(shipRoom, events, `/reactor/energy`),
        afterBurnerFuel: pointerReadNumericEventsApi(shipRoom, events, `/reactor/afterBurnerFuel`),
        turnSpeed: pointerReadNumericEventsApi(shipRoom, events, `/turnSpeed`),
        angle: pointerReadNumericEventsApi(shipRoom, events, `/angle`),
        speedDirection: pointerReadNumericEventsApi(shipRoom, events, `/velocityAngle`),
        speed: pointerReadNumericEventsApi(shipRoom, events, `/speed`),
        chainGunCooldown: pointerReadNumericEventsApi(shipRoom, events, `/chainGun/cooldown`),
        rotationTargetOffset: pointerBaseNumericEventsApi(shipRoom, events, `/smartPilot/rotationTargetOffset`),
        afterBurner: pointerBaseNumericEventsApi(shipRoom, events, `/afterBurnerCommand`),
        antiDrift: pointerBaseNumericEventsApi(shipRoom, events, `/antiDrift`),
        breaks: pointerBaseNumericEventsApi(shipRoom, events, `/breaks`),
        targeted: pointerReadEventsApi<TargetedStatus>(shipRoom, events, '/targeted'),
        chainGunIsFiring: pointerBaseEventsApi<boolean>(shipRoom, events, '/chainGun/isFiring'),
        target: pointerReadEventsApi<string | null>(shipRoom, events, '/targetId'),
        nextTargetCommand: pointerWriteApi<boolean>(shipRoom, '/nextTargetCommand'),
        clearTargetCommand: pointerWriteApi<boolean>(shipRoom, '/clearTargetCommand'),
        rotationMode: pointerReadEventsApi<SmartPilotMode>(shipRoom, events, '/smartPilot/rotationMode'),
        rotationModeCommand: pointerWriteApi<boolean>(shipRoom, '/rotationModeCommand'),
        maneuveringMode: pointerReadEventsApi<SmartPilotMode>(shipRoom, events, '/smartPilot/maneuveringMode'),
        maneuveringModeCommand: pointerWriteApi<boolean>(shipRoom, '/maneuveringModeCommand'),
        faction: pointerBaseEventsApi<Faction>(shipRoom, events, '/faction'),
    };
}

export async function ShipDriver(shipRoom: GameRoom<'ship'>) {
    const events = makeEventsEmitter(shipRoom.state);
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
