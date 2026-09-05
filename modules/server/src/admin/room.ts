import {
    AdminState,
    RegisterStationArg,
    cmdReceiver,
    createLogger,
    handleJsonPointerCommand,
    isJsonPointer,
    isSetValueCommand,
    registerStation,
} from '@starwards/core/internal';

import { Client, Room } from '@colyseus/core';

import { GameManager } from './game-manager';

const { error: logError } = createLogger('admin-room');

export class AdminRoom extends Room<AdminState> {
    public static id = 'admin';
    /** Tracks which station a connected client registered as, so `onLeave` can mark it disconnected without the client having said goodbye. */
    private sessionToStation = new Map<string, string>();
    private manager!: GameManager;

    constructor() {
        super();
        this.autoDispose = false;
    }

    public onCreate({ manager }: { manager: GameManager }) {
        this.manager = manager;
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
        const receiveRegistration = cmdReceiver(manager, registerStation);
        this.onMessage(
            registerStation.cmdName,
            (client: Client, message: { value: RegisterStationArg; path: void }) => {
                const stationId = message?.value?.stationId;
                if (stationId) {
                    this.sessionToStation.set(client.sessionId, stationId);
                }
                receiveRegistration(client, message);
            },
        );
    }

    public onLeave(client: Client) {
        const stationId = this.sessionToStation.get(client.sessionId);
        if (stationId) {
            this.sessionToStation.delete(client.sessionId);
            this.manager.state.disconnectStationCommands.push(stationId);
        }
    }
}
