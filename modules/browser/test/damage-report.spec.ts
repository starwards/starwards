import { System } from '@starwards/core';
import { getBrokenSystems } from '../src/widgets/damage-report-logic';

function makeSystem(name: string, broken: boolean): System {
    return {
        pointer: `/${name}`,
        state: { name, broken } as System['state'],
        defectibles: [],
        getStatus: () => (broken ? 'DISABLED' : 'OK'),
        getHeatStatus: () => 'OK',
    };
}

describe('getBrokenSystems', () => {
    test('returns nothing when no systems are broken', () => {
        expect(getBrokenSystems([makeSystem('radar', false), makeSystem('warp', false)])).toEqual([]);
    });

    test('returns only the broken systems, with name and pointer', () => {
        const systems = [makeSystem('radar', true), makeSystem('warp', false), makeSystem('reactor', true)];
        expect(getBrokenSystems(systems)).toEqual([
            { pointer: '/radar', name: 'radar' },
            { pointer: '/reactor', name: 'reactor' },
        ]);
    });
});
