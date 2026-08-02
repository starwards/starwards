import {
    AdminState,
    createLogger,
    handleJsonPointerCommand,
    isJsonPointer,
    isSetValueCommand,
} from '@starwards/core/internal';

import { GameManager } from './game-manager';
import { Room } from '@colyseus/core';

const { error: logError } = createLogger('admin-room');

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
        this.onMessage('*', (_, type, message: unknown) => {
            if (isSetValueCommand(message)) {
                if (!isJsonPointer(type)) {
                    logError(`message type="${type}" not registered. message="${JSON.stringify(message)}"`);
                    return;
                }
                if (!handleJsonPointerCommand(message, type, manager.state)) {
                    logError(
                        `JSON pointer command can't be handled. message="${JSON.stringify(message)}" type="${type}"`,
                    );
                }
            }
        });
    }
}
