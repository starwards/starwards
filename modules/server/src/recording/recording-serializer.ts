import { Client, ClientState, SchemaSerializer } from '@colyseus/core';
import { Schema } from '@colyseus/schema';

/** Receives every patch of every recording-capable room while a delta recording is running. */
export interface PatchTap {
    /** called right after a room patched its clients; `patch` is null when there was nothing to send */
    afterPatch(serializer: RecordingSerializer, patch: Uint8Array | null): void;
}

/**
 * Delta recording (SPEC-0006) is opt-in until the browser replays it: `STARWARDS_RECORDING_DELTAS=1`.
 * Read when a room is created and when a recording starts.
 */
export function recordingDeltasEnabled() {
    return process.env.STARWARDS_RECORDING_DELTAS === '1';
}

/**
 * The room's normal schema serializer, plus a recorder pseudo-client: while a {@link PatchTap} is set,
 * each patch also goes to the tap, byte for byte what clients receive. Also keeps a room with no
 * clients encoding patches instead of discarding them.
 */
export class RecordingSerializer extends SchemaSerializer<Schema> {
    /** serializers of the rooms that exist now */
    static readonly live = new Set<RecordingSerializer>();
    static tap: PatchTap | null = null;

    constructor(public readonly key: string) {
        super();
    }

    /**
     * True when the room's state has filtered fields: then a client without a view gets only the
     * unfiltered ones, so the recorder would silently miss data. Nothing filters today.
     */
    get filtered() {
        return this.hasFilters;
    }

    override applyPatches(clients: Client[]): boolean {
        const tap = RecordingSerializer.tap;
        if (!tap || this.hasFilters) return super.applyPatches(clients);
        let patch: Uint8Array | null = null;
        const recorder = {
            state: ClientState.JOINED,
            raw: (bytes: Uint8Array) => {
                // drop the protocol byte, and copy: the encoder reuses its buffer (`Buffer.slice` would not copy)
                patch = new Uint8Array(bytes.subarray(1));
            },
        } as unknown as Client;
        const changed = super.applyPatches([...clients, recorder]);
        tap.afterPatch(this, patch);
        return changed;
    }

    /**
     * The room's full state, encoded now (minus the protocol byte). Never the cached encoding: while
     * the room had no clients, `applyPatches` discarded changes without invalidating that cache.
     */
    fullState(): Uint8Array {
        this.needFullEncode = true;
        return new Uint8Array(this.getFullState().subarray(1));
    }
}

/**
 * A {@link RecordingSerializer} for a room about to be created, or null when delta recording is off.
 * The room must make it its only serializer: assigning `room.state` installs a fresh `SchemaSerializer`
 * through `room.setSerializer` (`@colyseus/core` Room's `state` setter), so the room overrides
 * `setSerializer` to substitute this one. Swapping serializers after `setState` instead would start a
 * second encoder whose refId counter restarts at 0 while the state's trees keep their old refIds.
 */
export function recordingSerializerFor(key: string): RecordingSerializer | null {
    if (!recordingDeltasEnabled()) return null;
    const serializer = new RecordingSerializer(key);
    RecordingSerializer.live.add(serializer);
    return serializer;
}
