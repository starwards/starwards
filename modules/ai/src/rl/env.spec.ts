import { allReference, runEpisode } from './env';
import { FEATURE_NAMES } from './features';
import path from 'node:path';
import { runBranch } from '../branching/fork';

const crews = path.resolve(__dirname, '../../crews');
const spec = (crew: string, seed: number) => ({
    crew: path.join(crews, crew),
    scenario: 'W-waves',
    seed,
    timeoutSeconds: Number(process.env.RL_G0_SECONDS ?? 120),
});
const seeds = (process.env.RL_G0_SEEDS ?? '1').split(',').map(Number);

describe('residual weapons env (G0)', () => {
    jest.setTimeout(3_600_000);

    it.each(seeds)('all-reference reproduces guard bit-identically, seed %i', async (seed) => {
        const guard = await runBranch(spec('captain-reference-guard.json', seed), 0);
        const { outcome, transitions } = await runEpisode(spec('captain-guard-rlw.json', seed), allReference);
        expect(outcome.whole).toBe(guard.whole);
        expect(outcome).toEqual(guard);
        expect(transitions.length).toBeGreaterThan(0);
        expect(transitions.every((x) => x.obs.length === FEATURE_NAMES.length)).toBe(true);
    });

    it('a non-reference head changes how the run is played', async () => {
        const guard = await runBranch(spec('captain-reference-guard.json', seeds[0]), 0);
        const { outcome } = await runEpisode(spec('captain-guard-rlw.json', seeds[0]), () => ({ gunFire: 'hold' }));
        expect(outcome.whole).not.toBe(guard.whole);
    });
});
