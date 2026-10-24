import { buildForks, pairedSummary, readGuardBank, sampleStart, splitBank } from './fork-bank';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rng } from './mlp';

describe('fork bank', () => {
    it('reads guard runs from waves results', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-'));
        fs.writeFileSync(
            path.join(dir, 'W-waves-waves.json'),
            JSON.stringify([{ seed: 5001, passed: false, fitness: { holdSeconds: 600 } }]),
        );
        expect(readGuardBank([dir])).toEqual([{ seed: 5001, passed: false, holdSeconds: 600 }]);
        fs.rmSync(dir, { recursive: true });
    });

    it('forks a run only while it is still going', () => {
        expect(buildForks([{ seed: 1, passed: false, holdSeconds: 600 }])).toEqual([
            { seed: 1, t: 400 },
            { seed: 1, t: 550 },
        ]);
    });

    it('held-out forks come from seeds training never uses', () => {
        const runs = Array.from({ length: 100 }, (_, i) => ({ seed: 5001 + i, passed: true, holdSeconds: 1500 }));
        const bank = splitBank(buildForks(runs), 50);
        expect(bank.heldOut).toHaveLength(50);
        const held = new Set(bank.heldOut.map((f) => f.seed));
        expect(bank.train.some((f) => held.has(f.seed))).toBe(false);
        expect(bank.trainSeeds.some((s) => held.has(s))).toBe(false);
        expect(bank.train.length + 52).toBe(400);
    });

    it('samples forks at the fork share, else whole games', () => {
        const runs = Array.from({ length: 20 }, (_, i) => ({ seed: i, passed: true, holdSeconds: 1500 }));
        const bank = splitBank(buildForks(runs), 8);
        const u = rng(1);
        const starts = Array.from({ length: 2000 }, () => sampleStart(bank, u, 0.7));
        const share = starts.filter((s) => s.t > 0).length / starts.length;
        expect(share).toBeGreaterThan(0.66);
        expect(share).toBeLessThan(0.74);
    });
});

describe('paired eval summary', () => {
    it('counts discordant pairs and brackets the difference', () => {
        const pairs = [
            ...Array.from({ length: 30 }, () => ({ policy: true, reference: false })),
            ...Array.from({ length: 10 }, () => ({ policy: false, reference: true })),
            ...Array.from({ length: 60 }, () => ({ policy: true, reference: true })),
        ];
        const s = pairedSummary(pairs);
        expect(s.diff).toBeCloseTo(0.2);
        expect(s.policyOnly).toBe(30);
        expect(s.referenceOnly).toBe(10);
        expect(s.ci[0]).toBeGreaterThan(0);
        expect(s.ci[1]).toBeLessThan(0.4);
    });
});
