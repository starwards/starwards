import { GameRoom, NamedGameRoom, Rooms, schemaClasses } from '@starwards/model';

import { Client } from 'colyseus.js';
import { waitForEvents } from './async-utils';

// const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);
const ENDPOINT = 'ws://' + window.location.host + '/';

export const client = new Client(ENDPOINT);

const rooms: { [T in keyof Rooms]?: GameRoom<Rooms[T]['state'], Rooms[T]['commands']> } = {};
const roomsById: { [k: string]: NamedGameRoom<'ship'> } = {};

export async function getGlobalRoom<T extends keyof Rooms>(roomName: T): Promise<NamedGameRoom<T>> {
    const room: NamedGameRoom<T> | undefined = rooms[roomName];
    if (!room) {
        const newRoom = await client.join<Rooms[T]['state']>(roomName, {}, schemaClasses[roomName]);
        // TODO register by newRoom.id?
        rooms[roomName] = newRoom as typeof rooms[T];
        return newRoom as NamedGameRoom<T>;
    }
    return room;
}
export async function getRoomById<T extends keyof Rooms>(roomName: T, id: string): Promise<NamedGameRoom<T>> {
    const room: NamedGameRoom<T> | undefined = roomsById[id];
    if (!room) {
        const newRoom = await client.joinById<Rooms[T]['state']>(id, {}, schemaClasses[roomName]);
        roomsById[roomName] = newRoom as typeof roomsById[T];
        return newRoom as NamedGameRoom<T>;
    }
    return room;
}

/**
 * return a ship room after state initialization
 * @param shipId ID of the ship
 */
export async function getShipRoom(shipId: string) {
    const shipRoom = await getRoomById('ship', shipId);
    const pendingEvents = [];
    if (!shipRoom.state.chainGun) {
        pendingEvents.push('chainGun');
    }
    if (!shipRoom.state.constants) {
        pendingEvents.push('constants');
    }
    await waitForEvents(shipRoom.state.events, pendingEvents);
    return shipRoom;
}
