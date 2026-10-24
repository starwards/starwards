import { allReference, potential, rewards, runEpisode, runForkEpisode } from './env';
import { runBranch, withReseed } from '../branching/fork';
import { FEATURE_NAMES } from './features';
import { REFERENCE_HEADS } from '@starwards/bots';
import path from 'node:path';

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

    it('an all-reference fork plays as the guard reseeded at the fork, deciding only from it', async () => {
        const run = { ...spec('captain-reference-guard.json', seeds[0]), timeoutSeconds: 120 };
        const guard = await runBranch(run, 60, withReseed(undefined, 60, 77, 'all'));
        const seen: number[] = [];
        const { outcome, steps, trip } = await runForkEpisode(
            { ...run, crew: path.join(crews, 'captain-guard-rlw.json') },
            { t: 60, key: 77 },
            (_obs, seconds) => {
                seen.push(seconds);
                return REFERENCE_HEADS;
            },
        );
        expect(outcome.whole).toBe(guard.whole);
        expect(steps.length).toBe(seen.length);
        expect(steps.length).toBeGreaterThan(0);
        expect(Math.min(...seen)).toBeGreaterThanOrEqual(60 - 1e-6);
        expect(trip.missilesFired).toBeGreaterThanOrEqual(0);
    });
});

describe('residual weapons rewards', () => {
    const reading = {
        capsuleLost: 0.5,
        armorLost: 1,
        hullDeficit: 0.2,
        missiles: 10,
        heShells: 5,
        enemies: new Set<string>(),
    };
    it('potential falls with station damage and hull, rises with kills and reserve', () => {
        expect(potential(reading, 2)).toBeCloseTo(-0.5 - 0.25 - 0.1 + 0.1 + 0.1);
    });
    it('shaping telescopes to -phi(first); the last step carries the terminal', () => {
        const steps = [0, -0.5, -1].map((phi, i) => ({ obs: [], seconds: i, phi }));
        const r = rewards(steps, true, 1);
        expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(0 + 1);
        expect(rewards(steps, false, 1).reduce((a, b) => a + b, 0)).toBeCloseTo(-1);
    });
});
