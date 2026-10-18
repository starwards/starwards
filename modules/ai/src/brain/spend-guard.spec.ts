import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ledgerTotal, reserve, settle, tokensUsd } from './spend-guard';

describe('jev spend guard', () => {
    let dir: string;
    let ledger: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-spend-'));
        ledger = path.join(dir, 'jev-ledger.jsonl');
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('holds a reservation at its estimate until it is settled at its actual cost', () => {
        const held = reserve(ledger, 'a', 0.004, 0.01);
        if (!held.ok) throw new Error(held.reason);
        expect(ledgerTotal(ledger)).toBeCloseTo(0.004, 12);
        settle(ledger, 'a', held.reservation, 50_000);
        expect(ledgerTotal(ledger)).toBeCloseTo(tokensUsd(50_000), 12);
    });

    it('refuses a batch that would pass the cap, and writes nothing for it', () => {
        expect(reserve(ledger, 'a', 0.006, 0.01).ok).toBe(true);
        const before = fs.readFileSync(ledger, 'utf8');
        const refused = reserve(ledger, 'b', 0.005, 0.01);
        expect(refused).toEqual({
            ok: false,
            total: 0.006,
            reason: expect.stringMatching(/exceeds the \$0.01 cap/) as string,
        });
        expect(fs.readFileSync(ledger, 'utf8')).toBe(before);
        expect(reserve(ledger, 'c', 0.004, 0.01).ok).toBe(true);
        expect(reserve(ledger, 'd', 1e-6, 0.01).ok).toBe(false);
    });

    it('keeps the reservation of a job that never settled', () => {
        reserve(ledger, 'crashed', 0.009, 0.01);
        expect(reserve(ledger, 'next', 0.002, 0.01).ok).toBe(false);
    });

    it('breaks a lock left by a job that died holding it', () => {
        fs.mkdirSync(`${ledger}.lock`);
        const old = new Date(Date.now() - 120_000);
        fs.utimesSync(`${ledger}.lock`, old, old);
        expect(reserve(ledger, 'a', 0.001, 0.01).ok).toBe(true);
        expect(fs.existsSync(`${ledger}.lock`)).toBe(false);
    });
});
