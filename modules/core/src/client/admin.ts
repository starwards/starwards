import {
    type AssignStationArg,
    REGISTER_STATION_REJECTED,
    type RegisterStationArg,
    type RegisterStationRejected,
    assignStation,
    registerStation,
} from '../stations';

import { AdminState } from '../admin';
import EventEmitter2 from 'eventemitter2';
import { Primitive } from 'colyseus-events';
import { Room } from 'colyseus.js';
import { RoomEventEmitter } from '..';
import { sendJsonCmd } from '../commands';
import { wireEvents } from 'colyseus-events';

const requestInfo = {
    method: 'POST',
    cache: 'no-cache',
    headers: {
        'Content-Type': 'application/json',
    },
} as const;
const emitter2Options = {
    wildcard: true,
    delimiter: '/',
    maxListeners: 0,
};

export type RecordingInfo = {
    name: string;
    mapName: string;
    startedAt: string;
    durationSeconds: number;
    frameCount: number;
};

export const AdminDriver = (endpoint: string) => async (adminRoom: Room<AdminState>) => {
    const events = new EventEmitter2(emitter2Options) as RoomEventEmitter;
    // IMPORTANT: colyseus-events v4 requires passing the room instead of room.state
    // We must wait for the first state sync before calling wireEvents because:
    // 1. The room's state may not be fully initialized immediately after connection
    // 2. Reference IDs (refIds) need to be set up for proper object tracking
    // 3. wireEvents needs access to the full state tree to set up listeners
    await new Promise<void>((resolve) => {
        adminRoom.onStateChange.once(() => {
            wireEvents(adminRoom, events);
            resolve();
        });
    });
    const rejectedListeners = new Set<(stationId: string) => void>();
    adminRoom.onMessage(REGISTER_STATION_REJECTED, (message: RegisterStationRejected) => {
        for (const cb of rejectedListeners) cb(message.stationId);
    });
    return {
        events,
        get state() {
            return adminRoom.state;
        },
        sendJsonCmd: (pointerStr: string, value: Primitive) => sendJsonCmd(adminRoom, pointerStr, value),
        registerStation: (arg: RegisterStationArg) => adminRoom.send(registerStation.cmdName, { value: arg }),
        /** GM override: (re)binds a registered station to a ship + station type, or unassigns it (`shipId: '', stationType: ''`). */
        assignStation: (arg: AssignStationArg) => adminRoom.send(assignStation.cmdName, { value: arg }),
        /** Fires when the server rejects a `registerStation` request for `stationId` (see `AdminRoom`'s collision check). */
        onRegisterStationRejected: (cb: (stationId: string) => void): (() => void) => {
            rejectedListeners.add(cb);
            return () => rejectedListeners.delete(cb);
        },
        stopGame: (): undefined => void fetch(endpoint + '/stop-game', { ...requestInfo, body: '{}' }),
        startGame: (mapName: string): undefined =>
            void fetch(endpoint + '/start-game', { ...requestInfo, body: JSON.stringify({ mapName }) }),
        loadGame: (data: string): undefined =>
            void fetch(endpoint + '/load-game', { ...requestInfo, body: JSON.stringify({ data }) }),
        saveGame: async () => {
            const response = await fetch(endpoint + '/save-game', {
                ...requestInfo,
                body: '{}',
            });
            return response.text();
        },
        listRecordings: async (): Promise<RecordingInfo[]> => {
            const response = await fetch(endpoint + '/recordings');
            return (await response.json()) as RecordingInfo[];
        },
        startRecording: async (): Promise<string> => {
            const response = await fetch(endpoint + '/start-recording', { ...requestInfo, body: '{}' });
            if (!response.ok) {
                // error responses carry a status text body, not JSON — parsing it would throw
                throw new Error(`can't start recording (HTTP ${response.status})`);
            }
            const { name } = (await response.json()) as { name: string };
            return name;
        },
        /** Resolves with what was written, so the caller can confirm the recording landed. */
        stopRecording: async (): Promise<RecordingInfo | null> => {
            const response = await fetch(endpoint + '/stop-recording', { ...requestInfo, body: '{}' });
            if (!response.ok) {
                throw new Error(`can't stop recording (HTTP ${response.status})`);
            }
            return (await response.json()) as RecordingInfo | null;
        },
        startReplay: (name: string): undefined =>
            void fetch(endpoint + '/start-replay', { ...requestInfo, body: JSON.stringify({ name }) }),
    };
};

export type AdminDriver = Awaited<ReturnType<ReturnType<typeof AdminDriver>>>;
