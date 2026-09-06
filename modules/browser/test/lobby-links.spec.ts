import { REVIEWER_GUIDE_URL } from '../src/lobby-links';

describe('REVIEWER_GUIDE_URL', () => {
    test('points at the reviewer guide on master', () => {
        expect(REVIEWER_GUIDE_URL).toBe('https://github.com/starwards/starwards/blob/master/docs/REVIEWING.md');
    });
});
