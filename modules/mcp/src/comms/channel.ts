export type CrewMessage = {
    speaker: string;
    text: string;
};

/**
 * The room the crew is sitting in.
 *
 * Not a ship system: nothing said here is subject to range, jamming or a damaged comms array. It
 * exists because a station sandboxed to its own seat cannot see most of the ship, which is the point
 * — signals is the only seat that can identify a blip, ECR the only seat that knows why power is
 * sagging — and the game only works when those seats tell each other.
 */
export interface CrewChannel {
    say(speaker: string, text: string): Promise<void>;
    /** Everything said since this speaker last listened, oldest first, excluding their own speech. */
    listen(speaker: string): Promise<CrewMessage[]>;
}
