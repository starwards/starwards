import { GameRoom, ShipState, shipProperties } from '@starwards/model';
import {
    NumberMapDriver,
    wrapIteratorStateProperty,
    wrapNormalNumericProperty,
    wrapNumericProperty,
    wrapStringStateProperty,
} from './utils';

import EventEmitter from 'eventemitter3';
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
            changes.forEach((c) => {
                events.emit('chainGun.' + c.field, c.value);
            });
        };
        state.chainGun.constants.onChange = (value: number, key: string) => {
            events.emit('chainGun.constants.' + key, value);
            events.emit('chainGun.constants');
        };
    });
    events.once('smartPilot', () => {
        state.smartPilot.onChange = (changes) => {
            changes.forEach((c) => {
                events.emit('smartPilot.' + c.field, c.value);
            });
        };

        state.smartPilot.maneuvering.onChange = (_) =>
            events.emit('smartPilot.maneuvering', state.smartPilot.maneuvering);
    });
    return events;
}

function wireCommands(shipRoom: GameRoom<'ship'>) {
    return {
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
        reserveSpeed: wrapNumericProperty(shipRoom, shipProperties.reserveSpeed),
        turnSpeed: wrapNumericProperty(shipRoom, shipProperties.turnSpeed),
        angle: wrapNumericProperty(shipRoom, shipProperties.angle),
        speedDirection: wrapNumericProperty(shipRoom, shipProperties.velocityAngle),
        speed: wrapNumericProperty(shipRoom, shipProperties.speed),
        chainGunCooldown: wrapNumericProperty(shipRoom, shipProperties.chainGunCoolDown),
        chainGunShellSecondsToLive: wrapNumericProperty(shipRoom, shipProperties.shellSecondsToLive),
        useReserveSpeed: wrapNormalNumericProperty(shipRoom, shipProperties.useReserveSpeed),
        antiDrift: wrapNormalNumericProperty(shipRoom, shipProperties.antiDrift),
        breaks: wrapNormalNumericProperty(shipRoom, shipProperties.breaks),
        targeted: wrapStringStateProperty(shipRoom, shipProperties.targeted),
        chainGunIsFiring: wrapIteratorStateProperty(shipRoom, shipProperties.chainGunIsFiring),
        target: wrapIteratorStateProperty(shipRoom, shipProperties.target),
        rotationMode: wrapIteratorStateProperty(shipRoom, shipProperties.rotationMode),
        maneuveringMode: wrapIteratorStateProperty(shipRoom, shipProperties.maneuveringMode),
    };
}

export type ShipDriver = ReturnType<typeof newShipDriverObj>;
export type ShipDriverRead = {
    state: ShipState;
    events: EventEmitter;
};

function newShipDriverObj(shipRoom: GameRoom<'ship'>) {
    const commands = wireCommands(shipRoom);
    const events = wireEvents(shipRoom.state);
    return {
        events,
        get state() {
            return shipRoom.state;
        },
        ...commands,
    };
}

export async function ShipDriver(shipRoom: GameRoom<'ship'>) {
    const driver = newShipDriverObj(shipRoom);
    const pendingEvents = [];
    if (!driver.state.chainGun) {
        pendingEvents.push('chainGun');
    }
    if (!driver.state.constants) {
        pendingEvents.push('constants');
    }
    await waitForEvents(driver.events, pendingEvents);
    return driver;
}
