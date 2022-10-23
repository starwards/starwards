import { GameRoom, RoomEventEmitter } from '..';

import EventEmitter2 from 'eventemitter2';
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
export const AdminDriver = (endpoint: string) => (adminRoom: GameRoom<'admin'>) => {
    const events = new EventEmitter2(emitter2Options) as RoomEventEmitter;
    wireEvents(adminRoom.state, events);
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
