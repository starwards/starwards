import { CALLOUT_QUESTION, calloutSaid } from './callout';
import { calloutMemory, referenceCallout } from './reference-orders';

import { BrainRequest } from './request';
import { BrainSpec } from './spec';
import { Display } from './controls';

const request = (...options: string[]) =>
    ({
        state: {},
        questions: {
            [CALLOUT_QUESTION]: {
                type: 'choice',
                instructions: '',
                criteria: Object.fromEntries([...options, 'silence'].map((o) => [o, ''])),
            },
        },
    }) as BrainRequest;

const WEAPONS = [
    'target_destroyed',
    'lost_lock',
    'salvo_away',
    'target_locked',
    'in_envelope',
    'out_of_envelope',
] as const;

type Shown = { id: string; distance: number; type?: string; faction?: number; radius?: number };

/** A display with the own ship (faction 1) at the origin facing 0°, contacts on bearing 0, and the lock on `lock`. */
function shown(contacts: Shown[], lock?: string): Display {
    return {
        panels: {
            'targeting-status': { targetId: lock },
            'ammo-status': {
                fitted: true,
                ammo: {
                    HiExpMissile: { count: 9, max: 12 },
                    ElecMissile: { count: 4, max: 4 },
                    CannonShell: { count: 500, max: 500 },
                },
            },
            'tubes-status': [{ index: 0, loadedProjectile: 'HiExpMissile', projectile: 'HiExpMissile' }],
        },
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: contacts.map((c) => ({
                name: c.id,
                bearing: 0,
                scanLevel: 'BASIC',
                type: 'Spaceship',
                faction: 2,
                radius: 11,
                position: { x: c.distance, y: 0 },
                ...c,
            })),
        },
    };
}

/** What a reference seat with these options says on each display in turn. */
function sayings(options: readonly string[], displays: Display[], heard: Parameters<typeof referenceCallout>[5] = {}) {
    const state = calloutMemory();
    let previous: Display | undefined;
    return displays.map((d) => {
        const said = referenceCallout(request(...options), d, previous, 0.5, undefined, { ...heard, state })?.choice;
        previous = d;
        return said;
    });
}

describe('reference weapons status callouts', () => {
    const raider = (distance: number) => ({ id: 'raider', distance });

    it('says target locked once, when the lock first holds an enemy ship', () => {
        expect(sayings(WEAPONS, [shown([raider(30_000)]), shown([raider(30_000)], 'raider')])[1]).toBe('target_locked');
    });

    it('says the locked ship came inside missile range, and reports it beyond range every 10 s', () => {
        const out = Array.from({ length: 22 }, () => shown([raider(80_000)], 'raider'));
        const said = sayings(['out_of_envelope'], out);
        expect(said.filter((s) => s === 'out_of_envelope')).toHaveLength(2);
        const coming = [shown([raider(50_000)], 'raider'), shown([raider(40_000)], 'raider')];
        expect(sayings(['in_envelope'], [...coming, coming[1]])).toEqual(['silence', 'in_envelope', 'silence']);
        // a lock taken inside the envelope is reported once the lock call is out
        expect(
            sayings(['target_locked', 'in_envelope'], [shown([raider(40_000)]), ...coming.slice(1), coming[1]]),
        ).toEqual(['silence', 'target_locked', 'in_envelope']);
    });

    it('says salvo away with its own count at a launch', () => {
        const d = shown([raider(30_000)], 'raider');
        const answer = referenceCallout(request(...WEAPONS), d, d, 0.5, undefined, { salvo: { n: 2, inFlight: 1 } });
        expect(answer).toEqual({ choice: 'salvo_away', source: 'rule', values: { n: '2', in_flight: '1' } });
    });

    it('tells a destroyed target (a wreck where it was) from a lost lock', () => {
        const locked = shown([raider(20_000)], 'raider');
        const wreck = shown([{ id: 'wreck', distance: 20_100, type: 'Derelict', faction: undefined }]);
        expect(sayings(WEAPONS, [locked, wreck])[1]).toBe('target_destroyed');
        expect(sayings(WEAPONS, [locked, shown([])])[1]).toBe('lost_lock');
        expect(sayings(WEAPONS, [locked, shown([raider(20_000)])])[1]).toBe('lost_lock');
    });

    it('fills the phrases from the weapons console and the seat count', () => {
        const spec = {
            decisionSeconds: 0.5,
            callouts: {
                salvo_away: {
                    say: '{n} launched, {in_flight} in flight, {magazine} left',
                    when: '',
                    fill: 'salvoTally',
                },
                out_of_envelope: { say: '{name} {range_to_go} km to go', when: '', fill: 'lockedEnvelope' },
            },
        } as unknown as BrainSpec;
        const d = shown([raider(80_000)], 'raider');
        expect(calloutSaid(spec, 'salvo_away', d, CALLOUT_QUESTION, d, { n: '2', in_flight: '1' })?.phrase).toBe(
            '2 launched, 1 in flight, 9 left',
        );
        expect(calloutSaid(spec, 'salvo_away', d)).toBeUndefined();
        expect(calloutSaid(spec, 'out_of_envelope', d)?.phrase).toBe('raider 35.0 km to go');
    });
});

describe('reference signals contact lost', () => {
    it('reports the enemy gone from the radar, with its last world bearing', () => {
        const before = shown([{ id: 'raider', distance: 50_000 }]);
        expect(sayings(['contact_lost', 'enemy_position'], [before, shown([])])).toEqual([
            'enemy_position',
            'contact_lost',
        ]);
        const spec = {
            decisionSeconds: 1,
            callouts: {
                contact_lost: { say: 'lost {name}, last bearing {last_bearing}', when: '', fill: 'lostContact' },
            },
        } as unknown as BrainSpec;
        expect(calloutSaid(spec, 'contact_lost', shown([]), CALLOUT_QUESTION, before)?.phrase).toBe(
            'lost raider, last bearing 000',
        );
    });
});

describe('reference captain listening', () => {
    const captain = ['close_to', 'engage', 'hold_here'];
    const lostCall = { speaker: 'signals', callout: 'contact_lost', phrase: '', secondsAgo: 1 };

    it('keeps its last order while signals reports the enemy lost, then holds once the hold runs out', () => {
        const state = calloutMemory();
        const empty = shown([]);
        const say = (heard: (typeof lostCall)[]) =>
            referenceCallout(request(...captain), empty, empty, 5, 'raider', { heard, state })?.choice;
        expect(say([lostCall])).toBe('silence');
        expect(say([])).toBe('silence');
        expect(say([])).toBe('silence');
        expect(say([])).toBe('hold_here');
    });

    it('engages when weapons reports the enemy in missile range', () => {
        const far = shown([{ id: 'raider', distance: 80_000 }]);
        const inRange = { speaker: 'weapons', callout: 'in_envelope', phrase: '', secondsAgo: 1 };
        expect(referenceCallout(request(...captain), far, far, 5)?.choice).toBe('close_to');
        expect(referenceCallout(request(...captain), far, far, 5, undefined, { heard: [inRange] })?.choice).toBe(
            'engage',
        );
    });
});
