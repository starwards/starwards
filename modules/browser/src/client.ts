import { Client } from 'colyseus.js';
import { Rooms, schemaClasses } from '@starwards/model';

// const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);
const ENDPOINT = 'ws://' + window.location.host + '/';

export const client = new Client(ENDPOINT);

const rooms: { [T in keyof Rooms]?: GameRoom<Rooms[T]['state'], Rooms[T]['commands']> } = {};

export type NamedGameRoom<T extends keyof Rooms> = GameRoom<Rooms[T]['state'], Rooms[T]['commands']>;
export interface GameRoom<S, C> {
    state: S;
    send<T extends keyof C>(type: T, message: C[T]): void;
}
export async function getRoom<T extends keyof Rooms>(roomName: T): Promise<NamedGameRoom<T>> {
    let room: NamedGameRoom<T> | undefined = rooms[roomName];
    if (!room) {
        const newRoom = await client.join<Rooms[T]['state']>(roomName, {}, schemaClasses[roomName]);
        rooms[roomName] = room = newRoom as any;
    }
    return room!;
}
