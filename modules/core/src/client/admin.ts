import { GameRoom, makeEventsEmitter } from '..';

const requestInfo = {
    method: 'POST',
    cache: 'no-cache',
    headers: {
        'Content-Type': 'application/json',
    },
} as const;

export const AdminDriver = (endpoint: string) => (adminRoom: GameRoom<'admin'>) => {
    const events = makeEventsEmitter(adminRoom.state);
    return {
        events,
        get state() {
            return adminRoom.state;
        },
        stopGame: () => void fetch(endpoint + '/stop-game', { ...requestInfo, body: '{}' }),
        startGame: (mapName: string) =>
            void fetch(endpoint + '/start-game', { ...requestInfo, body: JSON.stringify({ mapName }) }),
        loadGame: (data: string) =>
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
