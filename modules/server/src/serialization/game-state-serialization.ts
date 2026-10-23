import { Encoder, Schema } from '@colyseus/schema';
import { SAVED_GAME_MAGIC, isBinarySavedGame } from '@starwards/core/internal';
import { gzip, unzip, zstdCompress, zstdDecompress } from 'node:zlib';

import { ConstructingDecoder } from '@starwards/core/internal';

import { promisify } from 'node:util';

const do_gzip = promisify(gzip);
const do_unzip = promisify(unzip);
const do_zstd = promisify(zstdCompress);
const do_unzstd = promisify(zstdDecompress);
const LENGTH_BYTES = 4;

/**
 * Shared by every whole-game encode (`schemaToString`, `decodedCopy`) and kept at twice the largest
 * encoding seen or decoded. A fresh encoder starts at `Encoder.BUFFER_SIZE`, which a whole game (the
 * recorder's keyframe, every second) outgrows, so each call overflowed: a warning, a reallocation and
 * a second full encode.
 */
let encodeBuffer = new Uint8Array(Encoder.BUFFER_SIZE);

function reserveEncodeBuffer(size: number) {
    if (size * 4 > encodeBuffer.length * 3) {
        encodeBuffer = new Uint8Array(size * 2);
    }
}

/** The whole-state encoding of `fragment`, as a copy that outlives the shared encode buffer. */
export function schemaToBytes(fragment: Schema): Uint8Array {
    const encoded = new Encoder(fragment).encodeAll({ offset: 0 }, encodeBuffer);
    reserveEncodeBuffer(encoded.length);
    return Uint8Array.from(encoded);
}

export async function schemaToString(fragment: Schema) {
    const zipped = await do_gzip(Buffer.from(schemaToBytes(fragment)));
    return zipped.toString('base64');
}
/**
 * The binary saved-game file of `fragment`: {@link SAVED_GAME_MAGIC}, the snapshot's length (u32 LE, so a
 * truncated file is caught: zstd alone yields a partial snapshot), then the raw snapshot in a zstd frame.
 */
export async function schemaToSavedGame(fragment: Schema): Promise<Buffer> {
    return await bytesToSavedGame(schemaToBytes(fragment));
}

/** {@link schemaToSavedGame} of an already encoded snapshot. */
export async function bytesToSavedGame(bytes: Uint8Array): Promise<Buffer> {
    const length = Buffer.alloc(LENGTH_BYTES);
    length.writeUInt32LE(bytes.length);
    return Buffer.concat([SAVED_GAME_MAGIC, length, await do_zstd(bytes)]);
}

type Constructor<T extends Schema> = new (...args: never[]) => T;

/**
 * A copy of `source` built by decoding it, so every instance runs its constructor. A game must
 * resume from such a copy: `Schema.clone()` skips constructors, leaving each non-`@gameField`
 * field (`Explosion.hitObjectIds`, `SpaceObjectBase.collisionDamage`, ...) undefined. Encodes
 * a `clone()` of `source`, since only a clone is encodable whatever `source` is: a decoded
 * tree recorded no changes to encode, and a live one belongs to its room's encoder. A save loaded by
 * `stringToSchema` has already sized the encode buffer from its file.
 */
export function decodedCopy<T extends Schema>(ctor: Constructor<T>, source: T) {
    const copy = new ctor();
    new ConstructingDecoder(copy).decode(new Encoder(source.clone()).encodeAll({ offset: 0 }, encodeBuffer));
    return copy;
}

export async function stringToSchema<T extends Schema>(ctor: Constructor<T>, serialized: string) {
    return await stringToSchemaObject(new ctor(), serialized);
}

async function stringToSchemaObject<T extends Schema>(obj: T, serialized: string) {
    return bytesToSchemaObject(obj, await do_unzip(Buffer.from(serialized, 'base64')));
}

/**
 * Reads a saved game file in either format: binary ({@link schemaToSavedGame}) or the older text form
 * ({@link schemaToString}). Rejects on a truncated or corrupt file.
 */
export async function savedGameToSchema<T extends Schema>(ctor: Constructor<T>, file: Uint8Array) {
    return bytesToSchema(ctor, await savedGameToBytes(file));
}

/** The raw snapshot inside a saved game file of either format. Rejects on a truncated or corrupt file. */
export async function savedGameToBytes(file: Uint8Array): Promise<Uint8Array> {
    if (!isBinarySavedGame(file)) {
        return await do_unzip(Buffer.from(Buffer.from(file).toString('latin1'), 'base64'));
    }
    const headerLength = SAVED_GAME_MAGIC.length + LENGTH_BYTES;
    if (file.length < headerLength) throw new Error('truncated saved game');
    const expected = Buffer.from(file).readUInt32LE(SAVED_GAME_MAGIC.length);
    const bytes = await do_unzstd(file.subarray(headerLength));
    if (bytes.length !== expected) throw new Error('truncated saved game');
    return bytes;
}

/** Inverse of {@link schemaToBytes}. */
export function bytesToSchema<T extends Schema>(ctor: Constructor<T>, bytes: Uint8Array) {
    return bytesToSchemaObject(new ctor(), bytes);
}

function bytesToSchemaObject<T extends Schema>(obj: T, bytes: Uint8Array) {
    reserveEncodeBuffer(bytes.length);
    new ConstructingDecoder(obj).decode(Buffer.from(bytes));
    return obj;
}
