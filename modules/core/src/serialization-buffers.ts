import { Encoder } from '@colyseus/schema';

/**
 * The room handshake encodes the entire schema reflection into one buffer, and ShipState's tree has
 * outgrown the default.
 */
Encoder.BUFFER_SIZE = 32 * 1024;
