import { Driver } from './driver';
import { GameStatus } from '../admin';

export enum Status {
    DISCONNECTED,
    CONNECTED,
    GAME_RUNNING,
    SHIP_FOUND,
}

export type StatusInfo = {
    status: Status;
    text: string;
};

export class ClientStatus {
    constructor(
        private driver: Driver,
        private shipId?: string,
    ) {}

    onStatusChange = (cb: (s: StatusInfo) => unknown): (() => void) => {
        let lastStatus: StatusInfo = { status: -1 as Status, text: '-1' };
        let checking = Promise.resolve();
        const checkStatus = () => {
            checking = checking
                .then(async () => {
                    const currStatus = await this.getStatus();
                    if (currStatus.status !== lastStatus.status || currStatus.text !== lastStatus.text) {
                        await cb(currStatus);
                        lastStatus = currStatus;
                    }
                })
                .catch();
        };
        checkStatus();
        const unregister = this.driver.onGameStateChange(checkStatus);
        return unregister;
    };

    getStatus = async () => {
        const text = this.driver.errorMessage || '';
        if (!this.driver.isConnected) {
            return { status: Status.DISCONNECTED, text: text || 'not connected to server' };
        }
        if ((await this.driver.getGameStatus()) === GameStatus.STOPPED) {
            return { status: Status.CONNECTED, text: text || 'no active game' };
        }
        if ((await this.driver.getGameStatus()) === GameStatus.STARTING) {
            return { status: Status.CONNECTED, text: text || 'game starting' };
        }
        if ((await this.driver.getGameStatus()) === GameStatus.STOPPING) {
            return { status: Status.CONNECTED, text: text || 'game stopping' };
        }
        if (!this.shipId) {
            return { status: Status.GAME_RUNNING, text: '' };
        }
        if (!(await this.driver.doesShipExist(this.shipId))) {
            return { status: Status.GAME_RUNNING, text: 'ship not found' };
        }
        return { status: Status.SHIP_FOUND, text: '' };
    };
}
