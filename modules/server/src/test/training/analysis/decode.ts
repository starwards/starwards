import * as fs from 'node:fs';
import * as readline from 'node:readline';

import { Metadata, Schema } from '@colyseus/schema';
import { RecordingHeader, parseFrameLine, parseHeader } from '../../../recording/recording-format';

import { SavedGame } from '../../../serialization/game-state-protocol';
import { stringToSchema } from '../../../serialization/game-state-serialization';

/** One leaf value flattened out of a decoded frame. Exactly one of `num`/`str`/`bool` is set. */
interface DecodedValue {
    readonly objectId: string;
    readonly path: string;
    readonly num?: number;
    readonly str?: string;
    readonly bool?: boolean;
}

/** One object seen in a frame, with the `SpaceObject` discriminator (`type`) it was declared under. */
interface DecodedObject {
    readonly objectId: string;
    readonly type: string;
}

interface DecodedFrame {
    readonly frameNo: number;
    readonly t: number;
    readonly objects: readonly DecodedObject[];
    readonly values: readonly DecodedValue[];
}

const PRIMITIVE_NUM = new Set(['number', 'float32', 'float64', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32']);

/**
 * Flattens a decoded Colyseus `Schema` instance into `(path, value)` leaves, matching the repo's
 * JSON-pointer addressing scheme (`docs/json-ptr.md`). Walks `Metadata.getFields` rather than a
 * hardcoded path list, so new synced fields (e.g. automation private state) show up automatically.
 */
function flattenSchema(instance: Schema, prefix: string, objectId: string, out: DecodedValue[]): void {
    const fields = Metadata.getFields(instance.constructor) as Record<string, unknown>;
    for (const [name, def] of Object.entries(fields)) {
        const path = `${prefix}/${name}`;
        const value = (instance as unknown as Record<string, unknown>)[name];
        flattenField(def, value, path, objectId, out);
    }
}

function flattenField(def: unknown, value: unknown, path: string, objectId: string, out: DecodedValue[]): void {
    if (value === undefined || value === null) {
        return;
    }
    if (typeof def === 'string') {
        flattenPrimitive(def, value, path, objectId, out);
        return;
    }
    if (typeof def === 'function') {
        // nested Schema
        flattenSchema(value as Schema, path, objectId, out);
        return;
    }
    if (typeof def === 'object' && def !== null) {
        const arrayType = (def as { array?: unknown }).array;
        const mapType = (def as { map?: unknown }).map;
        if (arrayType !== undefined) {
            const arr = value as Iterable<unknown>;
            let i = 0;
            for (const item of arr) {
                flattenField(arrayType, item, `${path}/${i}`, objectId, out);
                i++;
            }
            return;
        }
        if (mapType !== undefined) {
            const map = value as Map<string, unknown>;
            for (const [key, item] of map) {
                flattenField(mapType, item, `${path}/${key}`, objectId, out);
            }
            return;
        }
    }
}

function flattenPrimitive(type: string, value: unknown, path: string, objectId: string, out: DecodedValue[]): void {
    if (type === 'boolean') {
        out.push({ objectId, path, bool: Boolean(value) });
    } else if (type === 'string') {
        out.push({ objectId, path, str: String(value) });
    } else if (PRIMITIVE_NUM.has(type)) {
        out.push({ objectId, path, num: Number(value) });
    }
    // unknown/opaque leaf types are skipped rather than guessed at
}

/**
 * Reads a `.swr.jsonl` recording and yields each frame fully flattened (not delta-encoded --
 * that happens on ingest into the store). A truncated final line is dropped, not thrown.
 */
export async function* decodeRecording(filePath: string): AsyncGenerator<DecodedFrame, void, void> {
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }) });
    let frameNo = 0;
    let sawHeader = false;
    for await (const line of rl) {
        if (!line.trim()) {
            continue;
        }
        if (!sawHeader) {
            parseHeader(line); // throws on a malformed header; header itself is read via readRecordingHeader
            sawHeader = true;
            continue;
        }
        const frameLine = parseFrameLine(line);
        if (!frameLine) {
            continue; // truncated tail line
        }
        const saved = await stringToSchema(SavedGame, frameLine.frame);
        const objects: DecodedObject[] = [];
        const values: DecodedValue[] = [];
        const spaceFields = Metadata.getFields(saved.fragment.space.constructor) as Record<string, unknown>;
        for (const [type, def] of Object.entries(spaceFields)) {
            const mapType = (def as { map?: unknown }).map;
            if (mapType === undefined) {
                continue; // e.g. lockedPaths
            }
            const map = (saved.fragment.space as unknown as Record<string, Iterable<[string, Schema]>>)[type];
            if (!map) {
                continue;
            }
            for (const [objectId, obj] of map) {
                objects.push({ objectId, type });
                flattenSchema(obj, '', objectId, values);
            }
        }
        for (const [shipId, shipState] of saved.fragment.ship) {
            flattenSchema(shipState, '', shipId, values);
            // `healthRatio` is a derived getter (`ShipState.healthRatio`), not a synced field, so
            // the generic metadata walk above never sees it. It is named explicitly as a path in
            // the design spec's event table, so it is computed here rather than proxied.
            values.push({ objectId: shipId, path: '/healthRatio', num: shipState.healthRatio });
        }
        yield { frameNo, t: frameLine.t, objects, values };
        frameNo++;
    }
}

/** Reads just the header line, without decoding any frame. */
export async function readRecordingHeader(filePath: string): Promise<RecordingHeader> {
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }) });
    for await (const line of rl) {
        rl.close();
        return parseHeader(line);
    }
    throw new Error(`empty recording: ${filePath}`);
}
