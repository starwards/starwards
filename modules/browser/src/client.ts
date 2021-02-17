import { GameRoom, RoomName, State, schemaClasses } from '@starwards/model';

import { Client } from 'colyseus.js';
import { waitForEvents } from './async-utils';

// const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ENDPOINT = protocol + '//' + window.location.host; // + '/';

export const client = new Client(ENDPOINT);

const rooms: { [R in RoomName]?: GameRoom<R> } = {};
const roomsById: { [k: string]: Promise<GameRoom<'ship'>> } = {};

export async function getGlobalRoom<R extends RoomName>(roomName: R): Promise<GameRoom<R>> {
    const room = rooms[roomName] as GameRoom<R> | undefined;
    if (room) {
        return room;
    }
    const newRoom = await client.join<State<R>>(roomName, {}, schemaClasses[roomName]);
    // TODO register by newRoom.id?
    rooms[roomName] = newRoom as typeof rooms[R];
    return newRoom as GameRoom<R>;
}
async function getRoomById<R extends RoomName>(
    roomName: R,
    id: string,
    initPause: (r: GameRoom<R>) => Promise<unknown>
): Promise<GameRoom<R>> {
    const room = roomsById[id] as Promise<GameRoom<R>> | undefined;
    if (room) {
        return room;
    }
    const newRoom = client.joinById<State<R>>(id, {}, schemaClasses[roomName]).then(async (room) => {
        await initPause(room);
        return room;
    });
    roomsById[roomName] = newRoom as typeof roomsById[R];
    return newRoom;
}

/**
 * return a ship room after state initialization
 * @param shipId ID of the ship
 */
export async function getShipRoom(shipId: string) {
    return await getRoomById('ship', shipId, async (shipRoom) => {
        const pendingEvents = [];
        if (!shipRoom.state.chainGun) {
            pendingEvents.push('chainGun');
        }
        if (!shipRoom.state.constants) {
            pendingEvents.push('constants');
        }
        await waitForEvents(shipRoom.state.events, pendingEvents);
    });
}
