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
    return {
        events,
        get state() {
            return adminRoom.state;
        },
        sendJsonCmd: (pointerStr: string, value: Primitive) => sendJsonCmd(adminRoom, pointerStr, value),
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
        stopRecording: (): undefined => void fetch(endpoint + '/stop-recording', { ...requestInfo, body: '{}' }),
        startReplay: (name: string): undefined =>
            void fetch(endpoint + '/start-replay', { ...requestInfo, body: JSON.stringify({ name }) }),
    };
};

export type AdminDriver = Awaited<ReturnType<ReturnType<typeof AdminDriver>>>;
