import { Adam, Mlp, backward, createMlp, forward, outputBiasOffset } from './mlp';
import { RESIDUAL_HEADS, ResidualHeads } from '@starwards/bots';

/**
 * PPO for the residual weapons policy: a 2×64 tanh policy net whose output is one logit slice per head
 * (index 0 of every head is `ref`), a separate 2×64 value net, and a penalty pulling each head toward `ref`
 * (cross-entropy to the all-reference policy, KL(all-reference ‖ π)) weighted by a coefficient the trainer
 * anneals to 0.
 */

export const HEADS = Object.keys(RESIDUAL_HEADS) as (keyof ResidualHeads)[];
export const HEAD_SIZES = HEADS.map((h) => RESIDUAL_HEADS[h].length);
const SLICES = HEAD_SIZES.map((_, i) => HEAD_SIZES.slice(0, i).reduce((a, b) => a + b, 0));
const LOGITS = HEAD_SIZES.reduce((a, b) => a + b, 0);
export const HIDDEN = [64, 64];

/** One action per head, as head option indexes in `HEADS` order. */
export type Action = number[];

export type Nets = { policy: Mlp; value: Mlp };

/** Fresh nets whose policy plays `ref` with probability ≈ e^refBias/(e^refBias + options−1) per head. */
export function createNets(inputs: number, seed: number, refBias = 3): Nets {
    const policy = createMlp([inputs, ...HIDDEN, LOGITS], seed);
    const bias = outputBiasOffset(policy);
    for (const s of SLICES) policy.params[bias + s] = refBias;
    return { policy, value: createMlp([inputs, ...HIDDEN, 1], seed + 1, 1) };
}

/** Each head's softmax over its slice of `logits`. */
export function headProbs(logits: ArrayLike<number>): number[][] {
    return HEAD_SIZES.map((n, h) => {
        const z = Array.from({ length: n }, (_, k) => logits[SLICES[h] + k]);
        const max = Math.max(...z);
        const e = z.map((v) => Math.exp(v - max));
        const sum = e.reduce((a, b) => a + b, 0);
        return e.map((v) => v / sum);
    });
}

/** Samples every head (or takes its most likely option, `greedy`); `logp` sums the heads. */
export function act(policy: Mlp, obs: ArrayLike<number>, u: () => number, greedy = false) {
    const probs = headProbs(forward(policy, obs).out);
    const action = probs.map((p) => {
        if (greedy) return p.indexOf(Math.max(...p));
        let r = u();
        for (let k = 0; k < p.length; k++) if ((r -= p[k]) < 0) return k;
        return p.length - 1;
    });
    return { action, probs };
}

/** Log-probability of `action` under `probs`, over the heads `mask` keeps (1) — a forced head counts 0. */
export function logProb(probs: number[][], action: Action, mask: readonly number[]) {
    return probs.reduce((s, p, h) => s + (mask[h] ? Math.log(Math.max(p[action[h]], 1e-12)) : 0), 0);
}

export function toHeads(action: Action): ResidualHeads {
    return Object.fromEntries(HEADS.map((h, i) => [h, RESIDUAL_HEADS[h][action[i]]])) as ResidualHeads;
}

/** Generalized advantage estimates and returns of one episode (terminal: the value after it is 0). */
export function gae(rewards: readonly number[], values: readonly number[], gamma: number, lambda: number) {
    const adv = new Array<number>(rewards.length);
    let next = 0;
    let running = 0;
    for (let i = rewards.length - 1; i >= 0; i--) {
        const delta = rewards[i] + gamma * next - values[i];
        running = delta + gamma * lambda * running;
        adv[i] = running;
        next = values[i];
    }
    return { adv, returns: adv.map((a, i) => a + values[i]) };
}

export type Sample = { obs: number[]; action: Action; mask: number[]; logp: number; adv: number; ret: number };
export type PpoOptions = {
    epochs: number;
    minibatch: number;
    lr: number;
    clip: number;
    entropy: number;
    /** Weight of the pull toward `ref` (cross-entropy to all-reference). */
    refCoef: number;
    valueCoef: number;
};
export const PPO_DEFAULTS: PpoOptions = {
    epochs: 4,
    minibatch: 1024,
    lr: 3e-4,
    clip: 0.2,
    entropy: 0.003,
    refCoef: 0,
    valueCoef: 0.5,
};

export type Optimizers = { policy: Adam; value: Adam };
export const createOptimizers = (nets: Nets): Optimizers => ({
    policy: new Adam(nets.policy.params.length),
    value: new Adam(nets.value.params.length),
});

/** One PPO update over `samples` (advantages normalized here); returns its diagnostics. */
export function ppoUpdate(nets: Nets, opt: Optimizers, samples: Sample[], o: PpoOptions, u: () => number) {
    const mean = samples.reduce((s, x) => s + x.adv, 0) / samples.length;
    const sd = Math.sqrt(samples.reduce((s, x) => s + (x.adv - mean) ** 2, 0) / samples.length) || 1;
    const stats = { kl: 0, clipFrac: 0, entropy: 0, refProb: 0, valueLoss: 0, n: 0 };
    const order = samples.map((_, i) => i);
    for (let epoch = 0; epoch < o.epochs; epoch++) {
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(u() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        for (let start = 0; start < order.length; start += o.minibatch) {
            const batch = order.slice(start, start + o.minibatch);
            const gp = new Float64Array(nets.policy.params.length);
            const gv = new Float64Array(nets.value.params.length);
            const w = 1 / batch.length;
            for (const idx of batch) {
                const s = samples[idx];
                const adv = (s.adv - mean) / sd;
                const fp = forward(nets.policy, s.obs);
                const probs = headProbs(fp.out);
                const logp = logProb(probs, s.action, s.mask);
                const ratio = Math.exp(logp - s.logp);
                const clipped = (adv > 0 && ratio > 1 + o.clip) || (adv < 0 && ratio < 1 - o.clip);
                const dOut = new Float64Array(LOGITS);
                probs.forEach((p, h) => {
                    const ent = -p.reduce((a, q) => a + (q > 0 ? q * Math.log(q) : 0), 0);
                    stats.entropy += ent;
                    stats.refProb += p[0];
                    for (let k = 0; k < p.length; k++) {
                        const z = SLICES[h] + k;
                        // entropy bonus: d(-H)/dz_k = p_k (log p_k + H)
                        dOut[z] += w * o.entropy * p[k] * (Math.log(Math.max(p[k], 1e-12)) + ent);
                        // pull toward ref: d(-log p_ref)/dz_k = p_k - [k = ref]
                        dOut[z] += w * o.refCoef * (p[k] - (k === 0 ? 1 : 0));
                        // clipped surrogate: d(-ratio·A)/dz_k = -ratio·A (onehot - p)
                        if (!clipped && s.mask[h]) dOut[z] += -w * ratio * adv * ((k === s.action[h] ? 1 : 0) - p[k]);
                    }
                });
                backward(nets.policy, fp, dOut, gp);
                const fv = forward(nets.value, s.obs);
                const err = fv.out[0] - s.ret;
                backward(nets.value, fv, [w * o.valueCoef * 2 * err], gv);
                stats.kl += s.logp - logp;
                stats.clipFrac += clipped ? 1 : 0;
                stats.valueLoss += err * err;
                stats.n++;
            }
            opt.policy.step(nets.policy.params, gp, o.lr);
            opt.value.step(nets.value.params, gv, o.lr);
        }
    }
    const heads = stats.n * HEADS.length;
    return {
        kl: stats.kl / stats.n,
        clipFrac: stats.clipFrac / stats.n,
        entropy: stats.entropy / heads,
        refProb: stats.refProb / heads,
        valueLoss: stats.valueLoss / stats.n,
    };
}

export const valueOf = (nets: Nets, obs: ArrayLike<number>) => forward(nets.value, obs).out[0];

/** A target choice is held at least this long before another may replace it. */
export const TARGET_HOLD_SECONDS = 3;
const TARGET = HEADS.indexOf('target');

/**
 * The heads to press: the sampled action, except that a target choice made under `TARGET_HOLD_SECONDS`
 * ago is kept (and its head masked out of training for that step).
 */
export function holdTarget(state: { held: number; since: number }, action: number[], seconds: number) {
    const mask = action.map(() => 1);
    const applied = [...action];
    if (action[TARGET] !== state.held) {
        if (seconds - state.since < TARGET_HOLD_SECONDS) {
            applied[TARGET] = state.held;
            mask[TARGET] = 0;
        } else {
            state.held = action[TARGET];
            state.since = seconds;
        }
    }
    return { applied, mask };
}
