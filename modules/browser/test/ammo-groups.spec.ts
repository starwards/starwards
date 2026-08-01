import { AmmoType } from '@starwards/core';
import { ammoGroups } from '../src/widgets/ammo-groups';

const dragonflyMagazine: Record<`max_${AmmoType}`, number> = {
    max_HiExpShell: 2400,
    max_ArmPenShell: 1200,
    max_FragShell: 2000,
    max_HiExpMissile: 12,
    max_ArmPenMissile: 6,
    max_FragMissile: 8,
    max_ClusterMissile: 6,
    max_TandemMissile: 4,
    max_ElecMissile: 4,
};

function magazine(overrides: Partial<Record<`max_${AmmoType}`, number>> = {}) {
    return { ...dragonflyMagazine, ...overrides };
}

describe('ammunition widget grouping', () => {
    test('shells and missiles are shown under separate headings', () => {
        expect(ammoGroups(magazine())).toEqual([
            { title: 'Shells', ammo: ['HiExpShell', 'ArmPenShell', 'FragShell'] },
            {
                title: 'Missiles',
                ammo: [
                    'HiExpMissile',
                    'ArmPenMissile',
                    'FragMissile',
                    'ClusterMissile',
                    'TandemMissile',
                    'ElecMissile',
                ],
            },
        ]);
    });

    test('ammo the magazine has no room for is not listed', () => {
        const groups = ammoGroups(magazine({ max_FragShell: 0, max_ClusterMissile: 0 }));
        const listed = groups.flatMap((group) => group.ammo);
        expect(listed).not.toContain('FragShell');
        expect(listed).not.toContain('ClusterMissile');
        expect(listed).toContain('HiExpShell');
        expect(listed).toContain('TandemMissile');
    });

    test('a heading with nothing to show is dropped', () => {
        const shellsOnly = magazine({
            max_HiExpMissile: 0,
            max_ArmPenMissile: 0,
            max_FragMissile: 0,
            max_ClusterMissile: 0,
            max_TandemMissile: 0,
            max_ElecMissile: 0,
        });
        expect(ammoGroups(shellsOnly).map((group) => group.title)).toEqual(['Shells']);
    });
});
