import { ShipManager, ShipState, createLogger, handleJsonPointerCommand } from '@starwards/core/internal';

import { Room } from '@colyseus/core';

const { error: logError } = createLogger('ship-room');

export class ShipRoom extends Room<ShipState> {
    constructor() {
        super();
        this.autoDispose = false;
    }

    public onCreate({ manager }: { manager: ShipManager }) {
        this.roomId = manager.spaceObject.id;
        this.setState(manager.state);
        this.onMessage('*', (_, type, message: unknown) => {
            if (!handleJsonPointerCommand(message, type, manager.state)) {
                logError(`onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
    }
}
