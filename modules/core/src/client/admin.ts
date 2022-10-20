import { GameRoom, makeEventsEmitter } from '..';

export const AdminDriver = (endpoint: string) => (adminRoom: GameRoom<'admin'>) => {
    const events = makeEventsEmitter(adminRoom.state);
    return {
        events,
        get state() {
            return adminRoom.state;
        },
        stopGame: () => {
            void fetch(endpoint + '/stop-game', {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: '{}',
            });
        },
        startGame: (mapName: string) => {
            void fetch(endpoint + '/start-game', {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mapName }),
            });
        },
        saveGame: async () => {
            const response = await fetch(endpoint + '/save-game', {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: '{}',
            });
            return response.text();
        },
        loadGame: (data: string) => {
            void fetch(endpoint + '/load-game', {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data }),
            });
        },
    };
};
