import { crewChannel } from './channel';

describe('crew channel', () => {
    it('delivers a callout to the other seats, not back to its speaker', () => {
        const channel = crewChannel();
        expect(channel.say('weapons', 'target locked', 10)).toBe(true);

        expect(channel.heard('helms', 12)).toEqual([{ speaker: 'weapons', phrase: 'target locked', secondsAgo: 2 }]);
        expect(channel.heard('weapons', 12)).toEqual([]);
    });

    it('forgets a callout after the hearing window', () => {
        const channel = crewChannel({ heardSeconds: 5 });
        channel.say('weapons', 'target locked', 10);

        expect(channel.heard('helms', 15)).toHaveLength(1);
        expect(channel.heard('helms', 15.5)).toEqual([]);
    });

    it('suppresses the same seat repeating the same phrase within the repeat window', () => {
        const channel = crewChannel({ repeatSeconds: 10 });
        expect(channel.say('weapons', 'target locked', 0)).toBe(true);
        expect(channel.say('weapons', 'target locked', 9)).toBe(false);
        expect(channel.say('weapons', 'lost the lock', 9)).toBe(true);
        expect(channel.say('helms', 'target locked', 9)).toBe(true);
        expect(channel.say('weapons', 'target locked', 10)).toBe(true);

        expect(channel.heard('engineer', 10).map((h) => `${h.speaker}: ${h.phrase}`)).toEqual([
            'weapons: lost the lock',
            'helms: target locked',
            'weapons: target locked',
        ]);
    });
});
