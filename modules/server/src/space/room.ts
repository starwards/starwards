import { Client, Room } from 'colyseus';
import {
    SpaceManager,
    SpaceState,
    cmdReceivers,
    getJsonPointer,
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
            const pointerStr = spaceProperties.objectCommandToPointerStr(type);
            if (isSetValueCommand(message) && pointerStr) {
                const { path, value } = message;
                const pointer = getJsonPointer(pointerStr);
                if (typeof path === 'string' && pointer) {
                    try {
                        pointer.set(manager.state.get(path), value);
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error(
                            `Error setting value ${String(value)} in ${type} : ${String((e as Error).stack)}`
                        );
                    }
                } else {
                    // eslint-disable-next-line no-console
                    console.error(`onMessage for type="${type}" and path="${JSON.stringify(path)}" not registered.`);
                }
            } else {
                // eslint-disable-next-line no-console
                console.error(`onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
    }
}
