import { Decoder, Schema } from '@colyseus/schema';

/**
 * A `Decoder` that builds each decoded Schema with its constructor, as @colyseus/schema 3 did.
 * Schema 5's decoder uses `initializeForDecoder()`: it skips subclass constructors (leaving every
 * non-`@gameField` field undefined) and attaches an untracked change tree, so the decoded tree can't
 * be handed to an `Encoder` (`child.setRoot is not a function`). Use it wherever a decoded tree
 * becomes server state: snapshot restore, `decodedCopy`.
 */
export class ConstructingDecoder<T extends Schema = Schema> extends Decoder<T> {
    override createInstanceOfType(type: typeof Schema): Schema {
        return new type();
    }
}
