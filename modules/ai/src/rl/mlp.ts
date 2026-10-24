/**
 * A small dense network in plain TypeScript: tanh hidden layers, a linear output, flat `Float64Array`
 * parameters (per layer: weights out×in row-major, then biases) so a worker can be sent them as one array.
 */
export type Mlp = { sizes: readonly number[]; params: Float64Array };
export type Forward = { acts: Float64Array[]; out: Float64Array };

/** Deterministic uniform [0, 1) stream (mulberry32). */
export function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const gauss = (u: () => number) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());

function paramCount(sizes: readonly number[]) {
    let n = 0;
    for (let l = 1; l < sizes.length; l++) n += sizes[l] * sizes[l - 1] + sizes[l];
    return n;
}

/** He-scaled gaussian weights, zero biases; the output layer is scaled by `outScale` (near-uniform heads). */
export function createMlp(sizes: readonly number[], seed: number, outScale = 0.01): Mlp {
    const u = rng(seed);
    const params = new Float64Array(paramCount(sizes));
    let o = 0;
    for (let l = 1; l < sizes.length; l++) {
        const [fanIn, fanOut] = [sizes[l - 1], sizes[l]];
        const scale = (l === sizes.length - 1 ? outScale : 1) * Math.sqrt(1 / fanIn);
        for (let i = 0; i < fanIn * fanOut; i++) params[o++] = gauss(u) * scale;
        o += fanOut;
    }
    return { sizes, params };
}

/** Offset of the output layer's biases in `params`. */
export function outputBiasOffset({ sizes }: Mlp) {
    return paramCount(sizes) - sizes[sizes.length - 1];
}

export function forward({ sizes, params }: Mlp, x: ArrayLike<number>): Forward {
    const acts: Float64Array[] = [Float64Array.from(x)];
    let o = 0;
    for (let l = 1; l < sizes.length; l++) {
        const [n, m] = [sizes[l - 1], sizes[l]];
        const input = acts[l - 1];
        const y = new Float64Array(m);
        const b = o + n * m;
        for (let j = 0; j < m; j++) {
            let s = params[b + j];
            const w = o + j * n;
            for (let i = 0; i < n; i++) s += params[w + i] * input[i];
            y[j] = l === sizes.length - 1 ? s : Math.tanh(s);
        }
        acts.push(y);
        o = b + m;
    }
    return { acts, out: acts[acts.length - 1] };
}

/** Adds d(loss)/d(params) to `grad`, given d(loss)/d(output) for the forward pass `f`. */
export function backward({ sizes, params }: Mlp, f: Forward, dOut: ArrayLike<number>, grad: Float64Array) {
    const offsets: number[] = [];
    let o = 0;
    for (let l = 1; l < sizes.length; l++) {
        offsets.push(o);
        o += sizes[l] * sizes[l - 1] + sizes[l];
    }
    let delta = Float64Array.from(dOut);
    for (let l = sizes.length - 1; l >= 1; l--) {
        const [n, m] = [sizes[l - 1], sizes[l]];
        const w0 = offsets[l - 1];
        const b = w0 + n * m;
        const input = f.acts[l - 1];
        const next = new Float64Array(n);
        for (let j = 0; j < m; j++) {
            const d = delta[j];
            if (d === 0) continue;
            grad[b + j] += d;
            const w = w0 + j * n;
            for (let i = 0; i < n; i++) {
                grad[w + i] += d * input[i];
                next[i] += d * params[w + i];
            }
        }
        if (l > 1) for (let i = 0; i < n; i++) next[i] *= 1 - input[i] * input[i];
        delta = next;
    }
}

/** Adam over a flat parameter array. */
export class Adam {
    private m: Float64Array;
    private v: Float64Array;
    private t = 0;
    constructor(
        size: number,
        private beta1 = 0.9,
        private beta2 = 0.999,
        private eps = 1e-8,
    ) {
        this.m = new Float64Array(size);
        this.v = new Float64Array(size);
    }
    step(params: Float64Array, grad: Float64Array, lr: number, maxNorm = 0.5) {
        let norm = 0;
        for (const g of grad) norm += g * g;
        const clip = Math.sqrt(norm) > maxNorm ? maxNorm / Math.sqrt(norm) : 1;
        this.t++;
        const c1 = 1 - this.beta1 ** this.t;
        const c2 = 1 - this.beta2 ** this.t;
        for (let i = 0; i < params.length; i++) {
            const g = grad[i] * clip;
            this.m[i] = this.beta1 * this.m[i] + (1 - this.beta1) * g;
            this.v[i] = this.beta2 * this.v[i] + (1 - this.beta2) * g * g;
            params[i] -= (lr * (this.m[i] / c1)) / (Math.sqrt(this.v[i] / c2) + this.eps);
        }
    }
}
