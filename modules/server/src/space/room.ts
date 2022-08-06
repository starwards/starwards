import { Client, Room } from 'colyseus';
import {
    SpaceManager,
    SpaceState,
    cmdReceivers,
    handleJsonPointerCommand,
    isSetValueCommand,
    spaceProperties,
} from '@starwards/model';

export class SpaceRoom extends Room<SpaceState> {
    public static id = 'space';

    constructor() {
        super();
        this.autoDispose = false;
    }

    public async onLeave(client: Client, consented: boolean) {
        if (!consented) {
            await this.allowReconnection(client, 30);
        }
    }

    public onCreate({ manager }: { manager: SpaceManager }) {
        this.roomId = SpaceRoom.id;
        this.setState(manager.state);
        for (const [cmdName, handler] of cmdReceivers(spaceProperties, manager)) {
            this.onMessage(cmdName, handler);
        }
        // handle all other messages
        this.onMessage('*', (_, type, message: unknown) => {
            if (isSetValueCommand(message) && typeof message.path === 'string') {
                const pointerStr = spaceProperties.objectCommandToPointerStr(type);
                if (!pointerStr) {
                    // eslint-disable-next-line no-console
                    console.error(`message type="${type}" not registered. message="${JSON.stringify(message)}"`);
                    return;
                }
                const obj = manager.state.get(message.path);
                if (!obj) {
                    // eslint-disable-next-line no-console
                    console.error(
                        `no object found for object command. message="${JSON.stringify(message)}" type="${type}"`
                    );
                    return;
                }
                if (!handleJsonPointerCommand(message, pointerStr, obj)) {
                    // eslint-disable-next-line no-console
                    console.error(
                        `object command can't be handled. message="${JSON.stringify(message)}" type="${type}"`
                    );
                }
            }
        });
    }
}
