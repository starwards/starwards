import { shouldShowGameMessage } from '../src/screens/game-message-overlay';

describe('shouldShowGameMessage', () => {
    test('empty message is not shown', () => {
        expect(shouldShowGameMessage('')).toBe(false);
    });

    test('whitespace-only message is not shown', () => {
        expect(shouldShowGameMessage('   ')).toBe(false);
    });

    test('non-empty message is shown', () => {
        expect(shouldShowGameMessage('Defeat: every station was lost during wave 3.')).toBe(true);
    });
});
