import {
    AdminState,
    REGISTER_STATION_REJECTED,
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
    /** Reverse of `sessionToStation`: who currently owns each connected station id, for the collision check below. */
    private stationToSession = new Map<string, string>();
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
                if (!stationId) {
                    return;
                }
                // Collision: `stationId` is already owned by a different, still-connected
                // session (e.g. two tabs that seeded the same id from `localStorage` before
                // either had picked its own). Reject rather than let this client silently take
                // over the other station's registry entry — the client generates a fresh id
                // and retries (see `beginStationRegistration`'s `onRejected`).
                const currentOwner = this.stationToSession.get(stationId);
                if (currentOwner && currentOwner !== client.sessionId) {
                    client.send(REGISTER_STATION_REJECTED, { stationId });
                    return;
                }
                // A rename: this session previously registered under a different id. That old
                // id's client-side owner is gone now, but nothing else tells the registry so —
                // retire it in the same drain, or it stays `connected: true` forever.
                const previousStationId = this.sessionToStation.get(client.sessionId);
                if (previousStationId && previousStationId !== stationId) {
                    this.stationToSession.delete(previousStationId);
                    manager.state.disconnectStationCommands.push(previousStationId);
                }
                this.sessionToStation.set(client.sessionId, stationId);
                this.stationToSession.set(stationId, client.sessionId);
                receiveRegistration(client, message);
            },
        );
    }

    public onLeave(client: Client) {
        const stationId = this.sessionToStation.get(client.sessionId);
        if (stationId) {
            this.sessionToStation.delete(client.sessionId);
            this.stationToSession.delete(stationId);
            this.manager.state.disconnectStationCommands.push(stationId);
        }
    }
}
