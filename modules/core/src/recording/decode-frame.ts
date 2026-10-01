import { Decoder, Schema } from '@colyseus/schema';

type Constructor<T extends Schema> = new (...args: never[]) => T;

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Decodes a recording frame (`schemaToString` output: base64 of gzipped Colyseus snapshot) using only
 * web platform APIs, so it runs in browsers as well as Node.
 */
export async function decodeFrame<T extends Schema>(ctor: Constructor<T>, serialized: string): Promise<T> {
    const obj = new ctor();
    new Decoder(obj).decode((await gunzip(fromBase64(serialized))) as never);
    return obj;
}
