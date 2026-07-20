/**
 * Deterministic 32-bit string hash (FNV-1a).
 * Stable across platforms and JS engines.
 */
export function fnv1a(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        // 32-bit FNV prime multiplication
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
}

/**
 * Mix two 32-bit integers into a new 32-bit integer.
 * Based on the xmur3 / MurmurHash3 finalizer.
 */
export function mix(a: number, b: number): number {
    let h = (a ^ Math.imul(b | 0, 0xcc9e2d51)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * Scramble a single 32-bit integer into a new, well-avalanched 32-bit integer.
 * The MurmurHash3 finalizer: a single-bit change in the input flips roughly
 * half the output bits.
 */
export function scramble(x: number): number {
    let h = x >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}
