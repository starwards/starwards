import { Projectile } from '@starwards/core';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';
import { runCrewTraining } from './train-crew';

/**
 * Playtest 2026-10-04 finding 1 (#1968): a crew emptied its magazine at a weak enemy without killing it.
 * Acceptance: a crew kills a dragonfly-MK1 that fights back (rung T1) within one magazine load.
 *
 * Measured 2026-10-15 (reference crew, seeds 1-16, 300 s cap): 16/16 kills, 30-97 s, 181-621 HiExp
 * shells and 1-4 HiExp missiles per kill (one load: 3600 shells, 10 HiExp missiles).
 */
describe('balance benchmark: crew kills a dragonfly-MK1 within one magazine load (#1968)', () => {
    let outDir: string;
    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-dragonfly-kill-'));
    });
    afterEach(() => rmDirRetrying(outDir));

    it.each([1, 2])(
        'reference crew, T1 seed %i',
        async (seed) => {
            const fired: Record<string, number> = {};
            let start: Record<string, number> | undefined;
            let magazine: Record<string, number> | undefined;
            const result = await runCrewTraining(path.resolve(__dirname, '../../crews/reference.json'), {
                scenario: 'T1',
                seed,
                timeoutSeconds: 300,
                latencySeconds: 0.2,
                outDir,
                intervalSimSeconds: 1,
                script: (game) => {
                    if (start) {
                        return;
                    }
                    magazine = game.shipManagers.get(TRAINING_PLAYER_ID)!.state.magazine as unknown as Record<
                        string,
                        number
                    >;
                    start = { HiExpShell: magazine.count_HiExpShell, HiExpMissile: magazine.count_HiExpMissile };
                    const insert = game.spaceManager.insert.bind(game.spaceManager);
                    game.spaceManager.insert = (o: Parameters<typeof insert>[0]) => {
                        if (Projectile.isInstance(o) && o.shipId === TRAINING_PLAYER_ID) {
                            fired[o.model] = (fired[o.model] ?? 0) + 1;
                        }
                        return insert(o);
                    };
                },
            });
            expect(result.killed).toBe(true);
            expect(fired.HiExpShell ?? 0).toBeLessThan(start!.HiExpShell);
            expect(fired.HiExpMissile ?? 0).toBeLessThanOrEqual(start!.HiExpMissile);
            // rounds the dragonfly's hits destroy (magazine defects) count against the load too
            expect(magazine!.count_HiExpShell).toBeGreaterThan(0);
        },
        300_000,
    );
});
