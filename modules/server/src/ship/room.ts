import { Client, Room } from 'colyseus';
import { ShipManager, ShipState, getJsonPointer, isSetValueCommand } from '@starwards/model';

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
        // handle all other messages
        this.onMessage('*', (_, type, message: unknown) => {
            if (isSetValueCommand(message)) {
                const pointer = getJsonPointer(type);
                if (pointer) {
                    try {
                        pointer.set(manager.state, message.value);
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error(
                            `Error setting value ${String(message.value)} in ${type} : ${String((e as Error).stack)}`
                        );
                    }
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
