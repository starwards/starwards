import { BOTS_PACKAGE } from '@starwards/bots';

describe('@starwards/bots', () => {
    it('resolves as a workspace package', () => {
        expect(BOTS_PACKAGE).toBe('@starwards/bots');
    });
});
