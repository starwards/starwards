import { gzip, unzip } from 'node:zlib';

import { Schema } from '@colyseus/schema';
import { promisify } from 'node:util';

const do_gzip = promisify(gzip);
const do_unzip = promisify(unzip);

export async function schemaToString(fragment: Schema) {
    const zipped = await do_gzip(Buffer.from(fragment.encodeAll()));
    return zipped.toString('base64');
}
type Constructor<T extends Schema> = new (...args: never[]) => T;

export async function stringToSchema<T extends Schema>(ctor: Constructor<T>, serialized: string) {
    return await stringToSchemaObject(new ctor(), serialized);
}

export async function stringToSchemaObject<T extends Schema>(obj: T, serialized: string) {
    const unzipped = await do_unzip(Buffer.from(serialized, 'base64'));
    obj.decode([...unzipped]);
    return obj;
}

export async function getUnzipped(zipped: string) {
    const unzipped = await do_unzip(Buffer.from(zipped, 'base64'));
    return unzipped.toString('base64');
}
