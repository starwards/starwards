import { Client, Room, Schema } from 'colyseus.js';
import { clientInitFunctions, Rooms } from '@starwards/model';

const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);

export const client = new Client(ENDPOINT);
client.onError.add((err: Error) => console.log('something wrong happened', err));

const rooms: {[T in keyof Rooms]?: GameRoom<Rooms[T]>} = {};

export interface GameRoom<T extends Schema> {
    state: T;
    ready: Promise<void>;
}
export function getRoom<T extends keyof Rooms>(roomName: T): GameRoom<Rooms[T]> {
    let room: GameRoom<Rooms[T]> | undefined = rooms[roomName];
    if (!room) {
        const newRoom = client.join<Rooms[T]>(roomName);
        room = newRoom as any;
        room!.ready = new Promise(resolve => {
            newRoom.onJoin.add(() => {
                clientInitFunctions[roomName](newRoom.state);
                const sessionId = newRoom.sessionId;
                console.log('sessionId', sessionId);
                client.onClose.add(() => {
                    console.log('rejoin');
                    client.rejoin(roomName, {sessionId});
                });
                resolve();
            });
        });
        rooms[roomName] = room;
    }
    return room!;
}
