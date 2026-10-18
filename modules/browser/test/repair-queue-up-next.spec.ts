import { RepairPriority, RepairProtocolMode, RepairProtocolStats } from '@starwards/core';
import { formatRepairUpNextEntry, getRepairUpNext, repairSlotTitle } from '../src/widgets/repair-queue-logic';

const catalog: Record<string, RepairProtocolStats> = {
    a: {
        name: 'Alpha fix',
        targets: [],
        modes: {
            [RepairProtocolMode.Responsive]: { duration: 1, energyDraw: 0, heat: 0, sideEffectSystems: [] },
            [RepairProtocolMode.Dark]: { duration: 1, energyDraw: 0, heat: 0, sideEffectSystems: [] },
        },
        tier: 'field',
    },
};

const slot = (protocolId: string, priority: RepairPriority, queuedSeq: number) => ({
    protocolId,
    priority,
    queuedSeq,
});

describe('repair queue up-next list (#2434)', () => {
    it('lists non-OFF slots numbered from 1: active first, then priority, then first queued', () => {
        const upNext = getRepairUpNext([
            slot('lowOld', RepairPriority.LOW, 1),
            slot('off', RepairPriority.OFF, 0),
            slot('highNew', RepairPriority.HIGH, 7),
            slot('highOld', RepairPriority.HIGH, 4),
            slot('running', RepairPriority.RUNNING, 2),
        ]);
        expect(upNext).toEqual([
            { position: 1, protocolId: 'running', priority: RepairPriority.RUNNING },
            { position: 2, protocolId: 'highOld', priority: RepairPriority.HIGH },
            { position: 3, protocolId: 'highNew', priority: RepairPriority.HIGH },
            { position: 4, protocolId: 'lowOld', priority: RepairPriority.LOW },
        ]);
    });

    it('CANCELLING counts as active and leads the list', () => {
        const upNext = getRepairUpNext([slot('h', RepairPriority.HIGH, 1), slot('c', RepairPriority.CANCELLING, 9)]);
        expect(upNext.map((e) => e.protocolId)).toEqual(['c', 'h']);
    });

    it('is empty when everything is OFF', () => {
        expect(getRepairUpNext([slot('a', RepairPriority.OFF, 0)])).toEqual([]);
    });

    it('formats a line as name and priority; blank for no entry', () => {
        expect(
            formatRepairUpNextEntry({ position: 1, protocolId: 'a', priority: RepairPriority.MEDIUM }, catalog),
        ).toBe('Alpha fix · MEDIUM');
        expect(formatRepairUpNextEntry({ position: 1, protocolId: 'zz', priority: RepairPriority.LOW }, catalog)).toBe(
            'zz · LOW',
        );
        expect(formatRepairUpNextEntry(undefined, catalog)).toBe('');
    });

    it('slot folder title carries the priority unless OFF', () => {
        expect(repairSlotTitle('Alpha fix', RepairPriority.HIGH)).toBe('Alpha fix · HIGH');
        expect(repairSlotTitle('Alpha fix', RepairPriority.OFF)).toBe('Alpha fix');
        expect(repairSlotTitle('Alpha fix', undefined)).toBe('Alpha fix');
    });
});
