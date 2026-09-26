/**
 * Threshold comparisons for synced `float32` game fields.
 *
 * The server holds each field as a double; every client and every snapshot holds it rounded to
 * float32 (`Math.fround`). A plain comparison therefore reads differently on the two sides when
 * the rounding moves a value across its threshold: `0.01` added sixty times is
 * `0.6000000000000003` on the server but `0.6000000238` on a client, and a snapshot restore leaves
 * the server comparing a double against a float32 threshold.
 *
 * These helpers compare `Math.fround` of both operands, which is exactly what every client
 * compares, so the server agrees with them bit for bit at every magnitude. No tolerance is
 * involved: a fixed absolute one is wrong somewhere on the scale (half a float32 ulp is ~3e-8 near
 * 0.6 but ~2e-6 near 45 degrees), a relative one still leaves a disagreement window at its own
 * edge, and either would read a value just past the threshold as reaching it.
 *
 * Agreement needs every operand to be the synced value itself. A threshold derived from synced
 * fields must be derived from their float32 view (see `RadarDesignState.maxMalfunctionRangeFactor`).
 */

/** `value >= threshold`, as every client reads the two synced `float32` fields. */
export function atLeastFloat32(value: number, threshold: number) {
    return Math.fround(value) >= Math.fround(threshold);
}

/** `value < threshold`, as every client reads the two synced `float32` fields. */
export function belowFloat32(value: number, threshold: number) {
    return Math.fround(value) < Math.fround(threshold);
}
