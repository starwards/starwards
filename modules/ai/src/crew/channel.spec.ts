import { crewChannel } from './channel';

const locked = { callout: 'target_locked', phrase: 'target locked' };

describe('crew channel', () => {
    it('publishes a callout to every other seat with its option, not back to its speaker', () => {
        const channel = crewChannel();
        expect(channel.say('weapons', locked, 10)).toBe(true);

        const heard = { speaker: 'weapons', callout: 'target_locked', phrase: 'target locked', secondsAgo: 2 };
        expect(channel.heard('helms', 12)).toEqual([heard]);
        expect(channel.heard('engineer', 12)).toEqual([heard]);
        expect(channel.heard('weapons', 12)).toEqual([]);
    });

    it('forgets a callout after the hearing window', () => {
        const channel = crewChannel({ heardSeconds: 5 });
        channel.say('weapons', locked, 10);

        expect(channel.heard('helms', 15)).toHaveLength(1);
        expect(channel.heard('helms', 15.5)).toEqual([]);
    });

    it('suppresses the same seat repeating the same phrase within the repeat window, but not new values', () => {
        const channel = crewChannel({ repeatSeconds: 10 });
        const turn = (degrees: number) => ({ callout: 'need_turn', phrase: `need you ${degrees}° left` });
        expect(channel.say('weapons', locked, 0)).toBe(true);
        expect(channel.say('weapons', locked, 9)).toBe(false);
        expect(channel.say('weapons', turn(4), 9)).toBe(true);
        expect(channel.say('weapons', turn(4), 9.5)).toBe(false);
        expect(channel.say('weapons', turn(2), 9.5)).toBe(true);
        expect(channel.say('helms', locked, 9)).toBe(true);
        expect(channel.say('weapons', locked, 10)).toBe(true);

        expect(channel.heard('engineer', 10).map((h) => `${h.speaker}: ${h.phrase}`)).toEqual([
            'weapons: need you 4° left',
            'weapons: need you 2° left',
            'helms: target locked',
            'weapons: target locked',
        ]);
    });
});
