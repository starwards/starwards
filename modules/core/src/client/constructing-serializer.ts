import { Decoder, Schema } from '@colyseus/schema';
import { SchemaSerializer, registerSerializer } from '@colyseus/sdk';
import { ConstructingDecoder } from '../constructing-decoder';

/**
 * The sdk's `SchemaSerializer`, decoding with {@link ConstructingDecoder} so every client-side
 * object runs its constructor (as it did on @colyseus/schema 3): client logic reads
 * non-`@gameField` fields that only the constructor sets (`isCorporal`, ...).
 *
 * The sdk assigns `serializer.decoder = new Decoder(state)` itself (in the `Room` constructor when
 * joining with a root schema, in `handshake()` otherwise), so the assignment is intercepted.
 */
export class ConstructingSchemaSerializer<T extends Schema = Schema> extends SchemaSerializer<T> {
    constructor() {
        super();
        let decoder: Decoder<T> | undefined;
        Object.defineProperty(this, 'decoder', {
            get: () => decoder,
            set: (value: Decoder<T>) => {
                decoder = value instanceof ConstructingDecoder ? value : new ConstructingDecoder<T>(value.state);
            },
            configurable: true,
            enumerable: true,
        });
    }
}

// rooms look their serializer up by id when they join
registerSerializer('schema', ConstructingSchemaSerializer);
