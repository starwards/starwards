import { GameRoom } from '..';
import { adminProperties } from '../admin';
import { cmdSender } from '../api';

export const AdminDriver = (endpoint: string) => (adminRoom: GameRoom<'admin'>) => {
    const speedCommand = cmdSender(adminRoom, adminProperties.speedCommand, undefined);
    return {
        get state() {
            return adminRoom.state;
        },
        pauseGame: () => speedCommand(0),
        resumeGame: () => speedCommand(1),
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
