import {
    SpaceManager,
    SpaceState,
    cmdReceivers,
    createLogger,
    handleJsonPointerCommand,
    isJsonPointer,
    isSetValueCommand,
    spaceCommands,
} from '@starwards/core/internal';

import { Room } from '@colyseus/core';

const { error: logError } = createLogger('space-room');

export class SpaceRoom extends Room<SpaceState> {
    public static id = 'space';

    constructor() {
        super();
        this.autoDispose = false;
    }

    public onCreate({ manager }: { manager: SpaceManager }) {
        this.roomId = SpaceRoom.id;
        this.setState(manager.state);
        for (const [cmdName, handler] of cmdReceivers(spaceCommands, manager)) {
            this.onMessage(cmdName, handler);
        }
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
