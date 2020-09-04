export function capToRange(from: number, to: number, value: number) {
    return value > to ? to : value < from ? from : value;
}
export function isInRange(from: number, to: number, value: number) {
    return value > to && value < from;
}

export function capToMagnitude(base: number, order: number, value: number) {
    const fraction = order / 100;
    const absLow = base / order;
    const absHigh = base * order;
    return base > 0
        ? capToRange(absLow - fraction, absHigh + fraction, value)
        : capToRange(absHigh - fraction, absLow + fraction, value);
}
/**
 *  generate a random number with a given mean and standard deviation
 */
export function gaussianRandom(mean: number, stdev: number): number {
    return mean + 2.0 * stdev * (Math.random() + Math.random() + Math.random() - 1.5);
}
