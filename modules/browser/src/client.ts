import { Client, Schema } from 'colyseus.js';
import { clientInitFunctions, Rooms } from '@starwards/model';

const ENDPOINT = 'ws:' + window.location.href.substring(window.location.protocol.length);

export const client = new Client(ENDPOINT);

// tslint:disable-next-line:no-console
client.onError.add((err: Error) => console.log('Error in colyseus', err));

const rooms: {[T in keyof Rooms]?: GameRoom<Rooms[T]['state'], Rooms[T]['commands']>} = {};

export type NamedGameRoom<T extends keyof Rooms> = GameRoom<Rooms[T]['state'], Rooms[T]['commands']>;
export interface GameRoom<S extends Schema, C> {
    state: S;
    ready: Promise<void>;
    send(data: C): void;
}
export function getRoom<T extends keyof Rooms>(roomName: T): NamedGameRoom<T> {
    let room: NamedGameRoom<T> | undefined = rooms[roomName];
    if (!room) {
        const newRoom = client.join<Rooms[T]['state']>(roomName);
        room = newRoom as any;
        room!.ready = new Promise(resolve => {
            newRoom.onJoin.add(() => {
                clientInitFunctions[roomName](newRoom.state);
                const sessionId = newRoom.sessionId;
                // console.log('sessionId', sessionId);
                client.onClose.add(() => {
                    // console.log('rejoin');
                    client.rejoin(roomName, {sessionId});
                });
                resolve();
            });
        });
        // const oldSend = newRoom.send;
        // newRoom.send = (data: any) => {
        //     console.log(roomName, 'send', data);
        //     oldSend.call(newRoom, data);
        // };
        rooms[roomName] = room;
    }
    return room!;
}
