import { AdminState } from '../admin';
import EventEmitter2 from 'eventemitter2';
import { Room } from 'colyseus.js';
import { RoomEventEmitter } from '..';
import { wireEvents } from 'colyseus-events';

const requestInfo = {
    method: 'POST',
    cache: 'no-cache',
    headers: {
        'Content-Type': 'application/json',
    },
} as const;
const emitter2Options = {
    wildcard: true,
    delimiter: '/',
    maxListeners: 0,
};
export const AdminDriver = (endpoint: string) => async (adminRoom: Room<AdminState>) => {
    const events = new EventEmitter2(emitter2Options) as RoomEventEmitter;
    // Wait for first state sync before wiring events to ensure refIds are initialized
    await new Promise<void>((resolve) => {
        adminRoom.onStateChange.once(() => {
            wireEvents(adminRoom, events);
            resolve();
        });
    });
    return {
        events,
        get state() {
            return adminRoom.state;
        },
        stopGame: (): undefined => void fetch(endpoint + '/stop-game', { ...requestInfo, body: '{}' }),
        startGame: (mapName: string): undefined =>
            void fetch(endpoint + '/start-game', { ...requestInfo, body: JSON.stringify({ mapName }) }),
        loadGame: (data: string): undefined =>
            void fetch(endpoint + '/load-game', { ...requestInfo, body: JSON.stringify({ data }) }),
        saveGame: async () => {
            const response = await fetch(endpoint + '/save-game', {
                ...requestInfo,
                body: '{}',
            });
            return response.text();
        },
    };
};

export type AdminDriver = ReturnType<ReturnType<typeof AdminDriver>>;
