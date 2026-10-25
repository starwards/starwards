import { AdversaryBaseline, adversaryMarkdown } from './report';
import { RANGE_BIN_EDGES } from './fingerprint';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(__dirname, '../../curriculum/baselines/adversary');
const committed = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('committed adversary baselines', () => {
    it('has one per rung family', () => {
        expect(committed).toContain('A1.json');
    });

    it.each(committed)('%s is well formed and its markdown renders', (file) => {
        const baseline = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as AdversaryBaseline;
        expect(path.basename(file, '.json')).toBe(baseline.rung);
        expect(baseline.rangeBinEdges).toHaveLength(RANGE_BIN_EDGES.length);
        expect(baseline.profiles.map((p) => p.profile)).toContain('today');
        for (const p of baseline.profiles) {
            expect(p.runs).toBe(baseline.seeds);
            expect(p.fingerprint.rangeShare.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
            expect(p.passRateCi[0]).toBeLessThanOrEqual(p.passRate);
            expect(p.passRateCi[1]).toBeGreaterThanOrEqual(p.passRate);
        }
        expect(adversaryMarkdown(baseline)).toContain(`# Adversary rung ${baseline.rung}`);
    });
});
