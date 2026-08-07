import { IterationData, Updateable } from '../updateable';
import { fnv1a, mix, scramble } from '../logic/hash';
import { hashToUnit } from '../logic/prng';
import { valueNoise1D } from '../logic/noise';

/**
 * Width of the event-salt window, in game-time seconds (see class doc).
 */
const EVENT_SALT_WINDOW_SECONDS = 3;

/**
 * Deterministic "chaos" die.
 *
 * Two kinds of rolls:
 *
 *  - `getRoll / getRollInRange / getSuccess` — **event rolls**.
 *    Hash of `(eventSalt, id)`, where `eventSalt` advances once every
 *    `EVENT_SALT_WINDOW_SECONDS` of accumulated game time. Within one
 *    window a given `id` always yields the same value ("stickiness
 *    quantum"); across windows it decorrelates. This makes a
 *    time-stretched phenomenon that rolls the same id every tick (e.g. a
 *    lingering explosion emitting one damage event per tick) cohere into
 *    one event-like outcome for the whole window, with a rare legitimate
 *    switch when it straddles a window boundary — without eternally
 *    freezing a phenomenon that failed its roll once.
 *
 *    The caller chooses stickiness through the key: a bare phenomenon id
 *    (e.g. `pickSystem:${damageId}`) is sticky — repeated rolls during a
 *    window agree, so a stream coheres onto one outcome. An id carrying a
 *    counter/index (e.g. `defect:${id}:${appIdx}:${system}:${rollIdx}`)
 *    is fresh — deliberately decorrelated per application, for magnitudes
 *    that must accumulate linearly rather than repeat all-or-nothing
 *    within a window.
 *
 *  - `getDrift / getDriftInRange` — **drift rolls**.
 *    Smoothly varying in game time, keyed off the die's immutable seed
 *    (not the event salt) so channels never jump when the salt rotates.
 *    Sampled as 1-D value noise at `noise(hash(id), gameTime * freq)`.
 *    Each channel has its own hash-derived phase so channels do not
 *    re-sync. Intended for continuous environmental jitter (smart-pilot
 *    aim, radar flicker).
 *
 * The die is deterministic given its inputs (seed, id, update sequence).
 * It does NOT attempt to deliver end-to-end simulation determinism —
 * game-loop tick timing, collision ordering and OS scheduling introduce
 * their own real-world chaos upstream of the die.
 */
export class ShipDie implements Updateable {
    private gameTime = 0;
    private readonly seed: number;
    private eventSalt: number;
    private eventWindowIndex = 0;

    constructor(seed?: number) {
        this.seed = (seed ?? (Math.random() * 0x100000000) >>> 0) >>> 0;
        this.eventSalt = this.seed;
    }

    public update({ deltaSeconds }: IterationData) {
        this.gameTime += deltaSeconds;
        const windowIndex = Math.floor(this.gameTime / EVENT_SALT_WINDOW_SECONDS);
        while (this.eventWindowIndex < windowIndex) {
            this.eventSalt = scramble(this.eventSalt);
            this.eventWindowIndex++;
        }
    }

    public getRoll(id: string): number {
        return hashToUnit(mix(this.eventSalt, fnv1a(id)));
    }

    public getRollInRange(id: string, min: number, max: number): number {
        return this.getRoll(id) * (max - min) + min;
    }

    public getSuccess(id: string, successProbability: number): boolean {
        return this.getRoll(id) < successProbability;
    }

    public getDrift(id: string, frequencyHz = 0.2): number {
        const channelSeed = mix(this.seed, fnv1a(id));
        return valueNoise1D(channelSeed, this.gameTime * frequencyHz);
    }

    public getDriftInRange(id: string, min: number, max: number, frequencyHz = 0.2): number {
        return this.getDrift(id, frequencyHz) * (max - min) + min;
    }

    /**
     * Event roll, shaped as an approximately-normal distribution via three summed unit rolls
     * (Irwin-Hall), bounded to `[mean - 3*stdev, mean + 3*stdev]`. The three sub-rolls are always
     * fresh (their ids are suffixed, never bare) regardless of the caller's own id, so this is safe
     * to call with a sticky id without colliding with an unrelated `getRoll` on the same id.
     */
    public getGaussian(id: string, mean: number, stdev: number): number {
        const r1 = hashToUnit(mix(this.eventSalt, fnv1a(`${id}:a`)));
        const r2 = hashToUnit(mix(this.eventSalt, fnv1a(`${id}:b`)));
        const r3 = hashToUnit(mix(this.eventSalt, fnv1a(`${id}:c`)));
        return mean + 2.0 * stdev * (r1 + r2 + r3 - 1.5);
    }
}
