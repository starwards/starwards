import { GameRoom, adminProperties, cmdSender } from '@starwards/model';

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
    };
};
