import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRunLog } from '../branching/run-log';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';
import { runCrewTraining } from './train-crew';
import { setReferenceKnobs } from '@starwards/bots';

describe('SIGNALS_MARK_LOCK in a headless 1v1 run', () => {
    let outDir: string;
    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signals-mark-'));
    });
    afterEach(() => {
        setReferenceKnobs();
        return rmDirRetrying(outDir);
    });

    const plateCalls = async (crew: string) => {
        const result = await runCrewTraining(path.resolve(__dirname, `../../crews/${crew}.json`), {
            scenario: 'T1',
            seed: 1,
            timeoutSeconds: 120,
            latencySeconds: 0.2,
            outDir,
            intervalSimSeconds: 1,
        });
        const log = readRunLog(result.recording!);
        return log.callouts.filter((c) => c.station === 'signals' && c.callout === 'plate_intel').length;
    };

    it('the informed crew (knob on) records plate_intel calls', async () => {
        expect(await plateCalls('captain-reference-guard-ammo-informed')).toBeGreaterThan(0);
    }, 300_000);
});
