import { Client, JoinOptions, Room } from 'colyseus.js';

const ENDPOINT = 'ws://localhost:8080'; // todo: use window.location
export const client = new Client(ENDPOINT);
client.onError.add((err: Error) => console.log('something wrong happened', err));

const rooms = new Map<string, Room>();
export function getRoom<T>(roomName: string): Room<T> {
    let room = rooms.get(roomName) as Room<T> | undefined;
    if (!room) {
        const newRoom = client.join<T>(roomName);
        room = newRoom;
        newRoom.onJoin.add(() => {
            const sessionId = newRoom.sessionId;
            console.log('sessionId', sessionId);
            client.onClose.add(() => {
                console.log('rejoin');
                client.rejoin(roomName, {sessionId});
            });
        });
        rooms.set(roomName, room);
      }
    return room;
}
