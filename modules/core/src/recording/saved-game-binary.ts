/**
 * First bytes of a binary saved game (`.ssg`): the snapshot's length (u32 LE) and a zstd frame of the raw Colyseus snapshot follow. What tells it
 * from the older text form (base64 of a gzipped snapshot), which starts with a base64 character.
 */
export const SAVED_GAME_MAGIC = new Uint8Array([0x53, 0x47, 0x53, 0x01]);

/** True when `head` starts with {@link SAVED_GAME_MAGIC}, i.e. is a binary saved game. */
export function isBinarySavedGame(head: Uint8Array): boolean {
    return SAVED_GAME_MAGIC.every((b, i) => head[i] === b);
}
