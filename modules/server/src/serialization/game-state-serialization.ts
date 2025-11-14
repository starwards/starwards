import { gzip, unzip } from 'node:zlib';

import { Schema, Encoder, Decoder } from '@colyseus/schema';
import { promisify } from 'node:util';

const do_gzip = promisify(gzip);
const do_unzip = promisify(unzip);

export async function schemaToString(fragment: Schema) {
    // In @colyseus/schema v3, use Encoder class
    const encoder = new Encoder(fragment);
    const encoded = encoder.encodeAll();
    const zipped = await do_gzip(Buffer.from(encoded) as Uint8Array);
    return zipped.toString('base64');
}
type Constructor<T extends Schema> = new (...args: never[]) => T;

export async function stringToSchema<T extends Schema>(ctor: Constructor<T>, serialized: string) {
    return await stringToSchemaObject(new ctor(), serialized);
}

export async function stringToSchemaObject<T extends Schema>(obj: T, serialized: string) {
    const unzipped = await do_unzip(Buffer.from(serialized, 'base64') as Uint8Array);
    // In @colyseus/schema v3, use Decoder class
    const decoder = new Decoder(obj);
    decoder.decode(Buffer.from(unzipped));
    return obj;
}

export async function getUnzipped(zipped: string) {
    const unzipped = await do_unzip(Buffer.from(zipped, 'base64') as Uint8Array);
    return unzipped.toString('base64');
}
