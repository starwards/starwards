import { ParityReport, parityMarkdown, runParity } from './parity';

describe('NPC vs PC parity report', () => {
    let report: ParityReport;
    beforeAll(() => {
        report = runParity();
    }, 240_000);
    const row = (scenario: string, readout: string) =>
        report.differing.find((r) => r.scenario === scenario && r.readout === readout);

    it('finds the energy tell: a PC ship drains its reactor under thrust, an NPC never does', () => {
        const energy = row('thrust', 'reactor.energy');
        expect(energy?.pc).toBeLessThan(100);
        expect(energy?.npc).toBeGreaterThan(400);
        expect(row('idle', '/radars/1.energyPerMinute')?.npc).toBe(0);
    });

    it('finds the repair tell: only the PC ship holds a queue and restores a damaged gun', () => {
        expect(row('defect-and-repair', 'repairQueue.slots')).toMatchObject({ npc: 0 });
        expect(row('defect-and-repair', 'repairQueue.slots')?.pc).toBeGreaterThan(0);
        const gun = row('defect-and-repair', '/chainGuns/0.rateOfFireFactor');
        expect(gun?.pc).toBeCloseTo(1, 1);
        expect(gun?.npc).toBeCloseTo(0.3, 1);
    });

    it('finds no difference in how hacking reads out', () => {
        const hackReadouts = report.differing.filter(
            (r) => r.scenario === 'hacked' && /\.(hacked|effectiveness|broken)$/.test(r.readout),
        );
        expect(hackReadouts).toEqual([]);
    });

    it('renders the structural and the measured differences', () => {
        const markdown = parityMarkdown(report);
        expect(markdown).toContain('## Differences in the rules');
        expect(markdown).toContain('### defect-and-repair');
        expect(markdown).toContain('repairQueue.slots');
    });
});

/** Hard gate for NPC ships on the real energy and repair rules (M4.67): conservation must read as a player ship's. */
describe('NPC vs PC parity with real energy and repair', () => {
    let report: ParityReport;
    beforeAll(() => {
        report = runParity(undefined, { npcRealEnergy: true });
    }, 240_000);
    const row = (scenario: string, readout: string) =>
        report.differing.find((r) => r.scenario === scenario && r.readout === readout);
    const energyRows = (scenario: string) =>
        report.differing.filter(
            (r) => r.scenario === scenario && /(reactor\.energy|energyPerMinute|energyStarved)/.test(r.readout),
        );

    it('an idle ship and a hacked ship read out as a PC ship does, energy included', () => {
        expect(report.differing.filter((r) => r.scenario === 'idle' || r.scenario === 'hacked')).toEqual([]);
    });

    it('conserves energy under thrust: the reactor drains and the thrusters meter like a PC ship', () => {
        expect(row('thrust', 'reactor.energy')?.npc).toBeLessThan(100);
        const perMinute = (readout: string) => row('thrust', readout);
        expect(perMinute('/maneuvering.energyPerMinute')?.npc).toBeGreaterThan(10);
        expect(perMinute('/thrusters/0.energyPerMinute')?.npc).toBeGreaterThan(10);
    });

    it('conserves energy under fire: no energy readout differs from the PC ship', () => {
        expect(energyRows('gun-burst')).toEqual([]);
    });

    it('works the repair queue: it holds slots and restores the damaged gun like a PC ship', () => {
        expect(row('defect-and-repair', 'repairQueue.slots')).toBeUndefined();
        expect(row('defect-and-repair', '/chainGuns/0.rateOfFireFactor')).toBeUndefined();
    });
});
