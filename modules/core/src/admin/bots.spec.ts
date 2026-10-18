import { AdminState } from '.';
import { assignBot } from './bots';

describe('assignBot', () => {
    it('a fresh AdminState has no bots', () => {
        expect(new AdminState().bots.size).toBe(0);
    });

    it('setValue enqueues the assignment', () => {
        const state = new AdminState();
        const arg = { shipId: 'GVTS', seat: 'pilot', brain: 'reference' };
        assignBot.setValue(state, arg);
        expect(state.assignBotCommands).toEqual([arg]);
    });
});
