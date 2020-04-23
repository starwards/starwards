import { Client } from 'colyseus.js';
import { initClient, Rooms } from '@starwards/model';

const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);

export const client = new Client(ENDPOINT);

const rooms: { [T in keyof Rooms]?: GameRoom<Rooms[T]['state'], Rooms[T]['commands']> } = {};

export type NamedGameRoom<T extends keyof Rooms> = GameRoom<Rooms[T]['state'], Rooms[T]['commands']>;
export interface GameRoom<S, C> {
    state: S;
    send(data: C): void;
}
export async function getRoom<T extends keyof Rooms>(roomName: T): Promise<NamedGameRoom<T>> {
    let room: NamedGameRoom<T> | undefined = rooms[roomName];
    if (!room) {
        const newRoom = await client.join<Rooms[T]['state']>(roomName);
        initClient(roomName, newRoom.state);
        (rooms[roomName] as any) = room = newRoom;
    }
    return room!;
}
