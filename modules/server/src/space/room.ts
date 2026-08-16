import {
    GM_SET_VALUE,
    SpaceManager,
    SpaceState,
    cmdReceivers,
    createLogger,
    handleGmSetValueCommand,
    handleJsonPointerCommand,
    isJsonPointer,
    isSetValueCommand,
    lockCommands,
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
        for (const [cmdName, handler] of cmdReceivers(lockCommands, manager)) {
            this.onMessage(cmdName, handler);
        }
        // GM tweak panel's write channel — its own message name keeps it off the '*' catch-all
        // below, and routes through handleGmSetValueCommand so it bypasses the property lock
        // (invariant I10: the GM outranks the lock).
        this.onMessage(GM_SET_VALUE, (_, message: unknown) => {
            if (!handleGmSetValueCommand(message, manager.state)) {
                logError(`GM onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
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
