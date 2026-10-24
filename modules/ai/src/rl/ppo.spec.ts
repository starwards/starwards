import {
    HEADS,
    PPO_DEFAULTS,
    Sample,
    act,
    createNets,
    createOptimizers,
    gae,
    headProbs,
    holdTarget,
    logProb,
    ppoUpdate,
    toHeads,
} from './ppo';
import { forward, rng } from './mlp';

const ones = (n: number) => Array.from({ length: n }, () => 1);
const missile = HEADS.indexOf('missile');

function batch(nets: ReturnType<typeof createNets>, u: () => number, obs: number[], reward: (a: number[]) => number) {
    return Array.from({ length: 512 }, (): Sample => {
        const { action, probs } = act(nets.policy, obs, u);
        const mask = ones(HEADS.length);
        const r = reward(action);
        return { obs, action, mask, logp: logProb(probs, action, mask), adv: r, ret: r };
    });
}

describe('ppo', () => {
    it('starts near all-reference', () => {
        const nets = createNets(6, 1);
        for (const p of headProbs(forward(nets.policy, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]).out)) {
            expect(p[0]).toBeGreaterThan(0.85);
        }
    });

    it('gae: lambda 1 gives discounted returns', () => {
        const { adv, returns } = gae([0, 0, 1], [0.5, 0.5, 0.5], 0.9, 1);
        expect(returns.map((r) => +r.toFixed(4))).toEqual([0.81, 0.9, 1]);
        expect(adv[2]).toBeCloseTo(0.5);
    });

    it('maps actions to head choices', () => {
        expect(toHeads([0, 0, 0, 0, 0])).toEqual({
            missile: 'ref',
            tubeAmmo: 'ref',
            gunAmmo: 'ref',
            target: 'ref',
            gunFire: 'ref',
        });
    });

    it('learns a rewarded head option (contextual bandit)', () => {
        const nets = createNets(4, 2);
        const opt = createOptimizers(nets);
        const u = rng(5);
        const obs = [1, 0, 0.5, 0.2];
        const reward = (a: number[]) => (a[missile] === 2 ? 1 : 0);
        for (let it = 0; it < 15; it++)
            ppoUpdate(nets, opt, batch(nets, u, obs, reward), { ...PPO_DEFAULTS, lr: 3e-3, minibatch: 128 }, u);
        expect(headProbs(forward(nets.policy, obs).out)[missile][2]).toBeGreaterThan(0.6);
    });

    it('the ref pull keeps an unrewarded policy at ref', () => {
        const nets = createNets(4, 3, 0);
        const opt = createOptimizers(nets);
        const u = rng(6);
        const obs = [0.3, 0.3, 0.3, 0.3];
        for (let it = 0; it < 15; it++)
            ppoUpdate(
                nets,
                opt,
                batch(nets, u, obs, () => 0),
                { ...PPO_DEFAULTS, lr: 3e-3, minibatch: 128, refCoef: 1 },
                u,
            );
        for (const p of headProbs(forward(nets.policy, obs).out)) expect(p[0]).toBeGreaterThan(0.8);
    });

    it('a masked head is not trained', () => {
        const nets = createNets(4, 4);
        const opt = createOptimizers(nets);
        const u = rng(7);
        const obs = [1, 1, 0, 0];
        const before = headProbs(forward(nets.policy, obs).out)[missile];
        const samples = batch(nets, u, obs, (a) => (a[missile] === 2 ? 1 : 0)).map((s) => {
            const mask = s.mask.map((m, h) => (h === missile ? 0 : m));
            return { ...s, mask, logp: logProb(headProbs(forward(nets.policy, obs).out), s.action, mask) };
        });
        for (let it = 0; it < 5; it++) ppoUpdate(nets, opt, samples, { ...PPO_DEFAULTS, lr: 3e-3, entropy: 0 }, u);
        const after = headProbs(forward(nets.policy, obs).out)[missile];
        expect(after[2]).toBeCloseTo(before[2], 2);
    });
});

describe('target hold', () => {
    it('keeps a target choice for 3 s, masking the head meanwhile', () => {
        const target = HEADS.indexOf('target');
        const state = { held: 0, since: -Infinity };
        const a = (t: number) => HEADS.map((_, h) => (h === target ? t : 0));
        expect(holdTarget(state, a(1), 10).mask[target]).toBe(1);
        const forced = holdTarget(state, a(2), 11);
        expect(forced.applied[target]).toBe(1);
        expect(forced.mask[target]).toBe(0);
        expect(holdTarget(state, a(1), 12).mask[target]).toBe(1);
        expect(holdTarget(state, a(2), 13.1).applied[target]).toBe(2);
    });
});
