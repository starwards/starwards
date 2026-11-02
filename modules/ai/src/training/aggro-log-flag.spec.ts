import { applyAggroLogFlag } from './aggro-log-flag';

describe('applyAggroLogFlag', () => {
    it('sets STARWARDS_AGGRO_LOG from --aggro-log[=period_s], defaulting to 1 s', () => {
        expect(applyAggroLogFlag(['node', 'x', '--aggro-log'], {})).toEqual({ STARWARDS_AGGRO_LOG: '1' });
        expect(applyAggroLogFlag(['node', 'x', '--aggro-log=0.25'], {})).toEqual({ STARWARDS_AGGRO_LOG: '0.25' });
    });

    it('leaves the env untouched without the flag', () => {
        expect(applyAggroLogFlag(['node', 'x', '--seed', '3'], { STARWARDS_AGGRO_LOG: '2' })).toEqual({
            STARWARDS_AGGRO_LOG: '2',
        });
        expect(applyAggroLogFlag(['node', 'x'], {})).toEqual({});
    });
});
