import { AdminState, adminProperties, cmdReceivers } from '@starwards/core';

import { GameManager } from './game-manager';
import { Room } from 'colyseus';

export class AdminRoom extends Room<AdminState> {
    public static id = 'admin';
    constructor() {
        super();
        this.autoDispose = false;
    }

    public onCreate({ manager }: { manager: GameManager }) {
        this.roomId = AdminRoom.id;
        this.setState(manager.state);
        this.setSimulationInterval((deltaMs) => void manager.update(deltaMs / 1000));
        for (const [cmdName, handler] of cmdReceivers(adminProperties, manager)) {
            this.onMessage(cmdName, handler);
        }
    }
}
