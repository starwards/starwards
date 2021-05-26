declare module '@pixi/filter-noise' {
    import { Filter } from '@pixi/core';

    /**
     * @author Vico @vicocotea
     * original filter: https://github.com/evanw/glfx.js/blob/master/src/filters/adjust/noise.js
     */
    /**
     * A Noise effect filter.
     *
     * @class
     * @extends PIXI.Filter
     * @memberof PIXI.filters
     */
    export class NoiseFilter extends Filter {
        /**
         * @param {number} [noise=0.5] - The noise intensity, should be a normalized value in the range [0, 1].
         * @param {number} [seed] - A random seed for the noise generation. Default is `Math.random()`.
         */
        constructor(public noise: number, public seed: number);
    }
}
