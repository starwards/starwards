import { hashToUnit, mulberry32 } from './prng';
import { mix } from './hash';

/**
 * 1-D value noise. Deterministic given (seed, x).
 * Interpolates hash-derived samples at integer positions with a cubic
 * (smoothstep) curve, producing a smoothly varying signal in [0, 1).
 *
 * Each integer position is an independent PRNG draw, so the signal is
 * non-periodic and has no visible tiling.
 */
export function valueNoise1D(seed: number, x: number): number {
    const i = Math.floor(x);
    const f = x - i;
    // cubic smoothstep: 3f^2 - 2f^3
    const t = f * f * (3 - 2 * f);
    const a = hashToUnit(mix(seed, i));
    const b = hashToUnit(mix(seed, i + 1));
    return a + (b - a) * t;
}

/**
 * Fractal (multi-octave) value noise. Sums `octaves` copies of the
 * signal at doubling frequencies and halving amplitudes. Output is
 * normalised back into [0, 1).
 */
export function fractalNoise1D(seed: number, x: number, octaves = 2): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    const rng = mulberry32(seed);
    for (let o = 0; o < octaves; o++) {
        const octaveSeed = (rng() * 0xffffffff) >>> 0;
        sum += amp * valueNoise1D(octaveSeed, x * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return sum / norm;
}
