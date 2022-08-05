import { Client, Room } from 'colyseus';
import {
    ShipManager,
    ShipState,
    cmdReceivers,
    getJsonPointer,
    isSetValueCommand,
    shipProperties,
} from '@starwards/model';

export class ShipRoom extends Room<ShipState> {
    constructor() {
        super();
        this.autoDispose = false;
    }

    public async onLeave(client: Client, consented: boolean) {
        if (!consented) {
            await this.allowReconnection(client, 30);
        }
    }
    public onCreate({ manager }: { manager: ShipManager }) {
        this.roomId = manager.spaceObject.id;
        this.setState(manager.state);
        for (const [cmdName, handler] of cmdReceivers(shipProperties, manager)) {
            this.onMessage(cmdName, handler);
        }
        // handle all other messages
        this.onMessage('*', (_, type, message: unknown) => {
            if (isSetValueCommand(message)) {
                const pointer = getJsonPointer(type);
                if (pointer) {
                    pointer.set(manager.state, message.value);
                } else {
                    // eslint-disable-next-line no-console
                    console.error(`onMessage for type="${type}" not registered.`);
                }
            } else {
                // eslint-disable-next-line no-console
                console.error(`onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
    }
}
