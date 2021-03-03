import { GameRoom, adminProperties, cmdSender } from '@starwards/model/src';

export function AdminDriver(adminRoom: GameRoom<'admin'>) {
    const shouldGameBeRunning = cmdSender(adminRoom, adminProperties.shouldGameBeRunning);
    return {
        state: adminRoom.state,
        stopGame: () => shouldGameBeRunning(false),
        startGame: () => shouldGameBeRunning(true),
    };
}
