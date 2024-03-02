import {
    SpaceManager,
    SpaceState,
    cmdReceivers,
    handleJsonPointerCommand,
    isJsonPointer,
    isSetValueCommand,
    spaceCommands,
} from '@starwards/core';

import { Room } from 'colyseus';

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
        // handle all other messages
        this.onMessage('*', (_, type, message: unknown) => {
            if (isSetValueCommand(message)) {
                if (!isJsonPointer(type)) {
                    // eslint-disable-next-line no-console
                    console.error(`message type="${type}" not registered. message="${JSON.stringify(message)}"`);
                    return;
                }
                if (!handleJsonPointerCommand(message, type, manager.state)) {
                    // eslint-disable-next-line no-console
                    console.error(
                        `JSON pointer command can't be handled. message="${JSON.stringify(message)}" type="${type}"`,
                    );
                }
            }
        });
    }
}
