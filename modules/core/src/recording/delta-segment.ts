import { Decoder, Encoder, Reflection, Schema } from '@colyseus/schema';
import { RecordingBaseLine, RecordingSegLine, SPACE_ROOM_KEY, decodeSegment } from './recording-format';
import { ConstructingDecoder } from '../constructing-decoder';
import { SavedGame } from './saved-game';
import { ShipState } from '../ship';
import { SpaceState } from '../space';
import { decodeRecordedBytes } from './decode-frame';

const SHIP_ROOM_PREFIX = 'ship:';

function fnv1a(hash: number, bytes: Iterable<number>) {
    for (const b of bytes) {
        hash ^= b;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
}

/**
 * Identifies the room schemas a recording's deltas were encoded with: a hash of the same reflection
 * handshake a client receives for the space and ship rooms. Deltas are only decodable by a build
 * with the same hash; keyframes do not depend on it.
 */
export function recordingSchemaHash(): string {
    let hash = 0x811c9dc5;
    for (const state of [new SpaceState(), new ShipState()]) {
        hash = fnv1a(hash, Reflection.encode(new Encoder(state)));
    }
    return hash.toString(16).padStart(8, '0');
}

/** One state reconstructed from a segment: the keyframe's game `dt` seconds later. */
export interface ReconstructedState {
    dt: number;
    game: SavedGame;
}

/**
 * Decodes `bytes` into `decoder`, throwing where the decoder only logs (an unknown refId or a schema
 * mismatch), so a corrupt patch fails its segment instead of silently diverging.
 */
/* eslint-disable no-console -- the decoder reports a bad refId only through console.error */
function strictDecode(decoder: Decoder, bytes: Uint8Array) {
    const { error, warn } = console;
    let complaint: unknown[] | null = null;
    console.error = console.warn = (...args: unknown[]) => {
        complaint ??= args;
    };
    try {
        decoder.decode(bytes);
    } finally {
        console.error = error;
        console.warn = warn;
    }
    if (complaint) {
        const [message, detail] = complaint as unknown[];
        const { index, ref } = (detail ?? {}) as { index?: unknown; ref?: unknown };
        throw new Error(`delta decode failed: ${String(message)} ${String(ref)} ${String(index)}`);
    }
}
/* eslint-enable no-console */

function snapshot(mapName: string, keyframe: SavedGame, space: SpaceState, ships: Map<string, ShipState>) {
    const game = new SavedGame();
    game.mapName = mapName;
    game.fragment.space = space.clone();
    for (const [id, ship] of keyframe.fragment.ship) {
        if (!ships.has(id)) game.fragment.ship.set(id, ship.clone());
    }
    for (const [id, ship] of ships) {
        game.fragment.ship.set(id, ship.clone());
    }
    // as `GameManager.saveGame` does: destroyed objects are gone for every player
    for (const destroyed of [...game.fragment.space[Symbol.iterator](true)]) {
        game.fragment.space.delete(destroyed);
        game.fragment.ship.delete(destroyed.id);
    }
    return game;
}

/**
 * Rebuilds the states between a keyframe and the next one: decodes each room's `base`, then applies
 * the segment's patches in order, taking a state after each space room patch (one per distinct `dt`).
 * Ships present in the keyframe but without a recorded room keep their keyframe state. Throws on any
 * decode problem; the caller then shows the keyframe for the whole segment.
 */
export async function reconstructSegment(
    keyframe: SavedGame,
    base: RecordingBaseLine,
    seg: RecordingSegLine,
): Promise<ReconstructedState[]> {
    const rooms = Object.keys(base.base);
    const decoders: Decoder[] = [];
    const ships = new Map<string, ShipState>();
    let space: SpaceState | null = null;
    let spaceIndex = -1;
    for (const [index, key] of rooms.entries()) {
        let state: Schema;
        if (key === SPACE_ROOM_KEY) {
            space = new SpaceState();
            spaceIndex = index;
            state = space;
        } else if (key.startsWith(SHIP_ROOM_PREFIX)) {
            const ship = new ShipState();
            ships.set(key.slice(SHIP_ROOM_PREFIX.length), ship);
            state = ship;
        } else {
            throw new Error(`unknown recorded room ${key}`);
        }
        const decoder = new ConstructingDecoder(state);
        try {
            strictDecode(decoder, await decodeRecordedBytes(base.base[key]));
        } catch (e) {
            throw new Error(`base ${key}: ${String(e)}`);
        }
        decoders.push(decoder);
    }
    if (!space) throw new Error('segment has no space room base');
    const patches = decodeSegment(await decodeRecordedBytes(seg.seg));
    const states: ReconstructedState[] = [];
    for (const patch of patches) {
        const decoder = decoders[patch.room];
        if (!decoder) throw new Error(`patch for unknown room index ${patch.room}`);
        try {
            strictDecode(decoder, patch.bytes);
        } catch (e) {
            throw new Error(`patch for ${rooms[patch.room]} at dt ${patch.dt}: ${String(e)}`);
        }
        if (patch.room !== spaceIndex) continue;
        const state = { dt: patch.dt, game: snapshot(keyframe.mapName, keyframe, space, ships) };
        if (states.length && states[states.length - 1].dt === patch.dt) {
            states[states.length - 1] = state;
        } else {
            states.push(state);
        }
    }
    return states;
}
