import { GameRoom, adminProperties, cmdSender } from '@starwards/model/src';

export function AdminDriver(adminRoom: GameRoom<'admin'>) {
    const shouldGameBeRunning = cmdSender(adminRoom, adminProperties.shouldGameBeRunning);
    return {
        get state() {
            return adminRoom.state;
        },
        stopGame: () => shouldGameBeRunning(false),
        startGame: () => shouldGameBeRunning(true),
    };
}
