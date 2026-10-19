import { ConstructingDecoder } from '../constructing-decoder';
import { Encoder } from '@colyseus/schema';
import { ShipState } from './ship-state';

/**
 * A faction's frozen view of a ship (SPEC-0008): the ship's `ShipState` encoded at the moment the
 * faction's FULL scan demoted to SNAPSHOT. Held server-side outside any room state and delivered by
 * message, so it never enters state sync.
 */
export type ShipSnapshot = {
    /** IterationData.totalSeconds at capture, matching `scanSnapshotCapturedAt` */
    readonly capturedAt: number;
    /** full-state encoding of the captured `ShipState`; decode with `decodeShipSnapshot` */
    readonly data: Uint8Array;
};

/** Encodes a detached copy of `state`, so the live state's own room encoder is untouched. */
export function encodeShipSnapshot(state: ShipState): Uint8Array {
    return new Encoder(state.clone()).encodeAll().slice();
}

/** Rebuilds a detached `ShipState` from `encodeShipSnapshot` output. */
export function decodeShipSnapshot(data: Uint8Array): ShipState {
    const state = new ShipState();
    new ConstructingDecoder(state).decode(data);
    return state;
}

/** ShipRoom message a client sends, while it lacks the latest snapshot of `targetId`, to ask for it. */
export const NEED_SNAPSHOT = 'needSnapshot';
/** ShipRoom message the server replies with: the room faction's snapshot of the target. */
export const SNAPSHOT = 'snapshot';

export type NeedSnapshotMessage = {
    targetId: string;
    /** `capturedAt` of the snapshot the client already holds; the server replies only with a newer one */
    haveCapturedAt?: number;
};

export type SnapshotMessage = ShipSnapshot & {
    targetId: string;
    /** game seconds since capture, at the time of the reply */
    ageSeconds: number;
};
