export function capToRange(from: number, to: number, value: number) {
    return value > to ? to : value < from ? from : value;
}

/**
 *  generate a random number with a given mean and standard deviation
 */
export function gaussianRandom(mean: number, stdev: number): number {
    return mean + 2.0 * stdev * (Math.random() + Math.random() + Math.random() - 1.5);
}
