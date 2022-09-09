import { ShipManager, ShipState, handleJsonPointerCommand } from '@starwards/core';

import { Room } from 'colyseus';

export class ShipRoom extends Room<ShipState> {
    constructor() {
        super();
        this.autoDispose = false;
    }

    public onCreate({ manager }: { manager: ShipManager }) {
        this.roomId = manager.spaceObject.id;
        this.setState(manager.state);
        // handle all other messages
        this.onMessage('*', (_, type, message: unknown) => {
            if (!handleJsonPointerCommand(message, type, manager.state)) {
                // eslint-disable-next-line no-console
                console.error(`onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
    }
}
