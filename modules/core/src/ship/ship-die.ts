import { IterationData, Updateable } from '../updateable';
import { fnv1a, mix } from '../logic/hash';
import { hashToUnit } from '../logic/prng';
import { valueNoise1D } from '../logic/noise';

/**
 * Deterministic "chaos" die.
 *
 * Two kinds of rolls:
 *
 *  - `getRoll / getRollInRange / getSuccess` — **event rolls**.
 *    Pure hash of `(seed, id)`. Independent of time. Same `id` always
 *    yields the same value, for the entire lifetime of that id. Intended
 *    for one-off events whose identity is captured by the id string
 *    (e.g. `'damageManeuvering:' + damageEventId`).
 *
 *  - `getDrift / getDriftInRange` — **drift rolls**.
 *    Smoothly varying in game time. Sampled as 1-D value noise at
 *    `noise(hash(id), gameTime * freq)`. Each channel has its own
 *    hash-derived phase so channels do not re-sync. Intended for
 *    continuous environmental jitter (smart-pilot aim, radar flicker).
 *
 * The die is deterministic given its inputs (seed, id, time). It does
 * NOT attempt to deliver end-to-end simulation determinism — game-loop
 * tick timing, collision ordering and OS scheduling introduce their own
 * real-world chaos upstream of the die.
 */
export class ShipDie implements Updateable {
    private gameTime = 0;
    private readonly seed: number;

    constructor(seed?: number) {
        this.seed = (seed ?? (Math.random() * 0x100000000) >>> 0) >>> 0;
    }

    public update({ deltaSeconds }: IterationData) {
        this.gameTime += deltaSeconds;
    }

    public getRoll(id: string): number {
        return hashToUnit(mix(this.seed, fnv1a(id)));
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
}
