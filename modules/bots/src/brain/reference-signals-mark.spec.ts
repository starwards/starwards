import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_KNOB_DEFAULTS, setReferenceKnobs } from './reference-knobs';

import { BrainRequest } from './request';
import { Heard } from './callout';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = { commands: [{ command: 'markTarget' }] };

const ship = (id: string, distance: number, faction = 2) => ({
    id,
    name: id,
    type: 'Spaceship',
    faction,
    distance,
    bearing: 0,
    scanLevel: 'BASIC',
    position: { x: 0, y: 0 },
});

function display(marked = ''): Display {
    return {
        panels: { 'target-intel': { targetId: marked } },
        radar: {
            ownShip: { id: 'me', heading: 0, faction: 1 },
            contacts: [ship('near', 1000), ship('far', 5000), ship('friend', 500, 1)],
        },
    };
}

const locked = (id: string, name = id, secondsAgo = 1): Heard => ({
    speaker: 'weapons',
    callout: 'target_locked',
    phrase: `target locked on ${name}`,
    values: { name, id },
    secondsAgo,
});

type Radar = { contacts: ReturnType<typeof ship>[] };

/** One decision of a fresh policy, or of `policy` when the test spans decisions. */
async function decide(shown: Display, heard: Heard[] = [], policy = makeReferencePolicy(1)) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown, heard);
    return {
        offered: controls.map((c) => c.id),
        ids: Object.keys(answers).filter((id) => answers[id]?.choice === 'press'),
        sent: controls.flatMap((c) => (answers[c.id]?.choice === 'press' ? [c.press('press')] : [])),
    };
}

afterEach(() => setReferenceKnobs());

describe('signals markTarget', () => {
    it('knob off by default: the console offers no mark control and nothing is marked', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.SIGNALS_MARK_LOCK).toBe(0);
        const { offered, ids } = await decide(display(), [locked('far')]);
        expect(offered).toEqual([]);
        expect(ids).toEqual([]);
    });

    describe('knob on', () => {
        beforeEach(() => setReferenceKnobs({ SIGNALS_MARK_LOCK: 1 }));

        it('marks the contact weapons locked, by id', async () => {
            const { sent } = await decide(display(), [locked('far')]);
            expect(sent).toEqual([{ command: 'markTarget', args: {}, value: 'far' }]);
        });

        it('tells same-named ships apart by id', async () => {
            const shown = display();
            const twin = { ...ship('twin', 9000), name: 'near' };
            (shown.radar as Radar).contacts.push(twin);
            expect((await decide(shown, [locked('twin', 'near')])).ids).toEqual(['markTarget:twin']);
        });

        it('keeps following the lock after the call is no longer heard', async () => {
            const policy = makeReferencePolicy(1);
            expect((await decide(display(), [locked('far')], policy)).ids).toEqual(['markTarget:far']);
            expect((await decide(display('far'), [], policy)).ids).toEqual([]);
            // the mark was knocked off the lock: Signals puts it back
            expect((await decide(display('near'), [], policy)).ids).toEqual(['markTarget:far']);
        });

        it('with no lock heard: keeps a valid mark, else marks the nearest enemy', async () => {
            expect((await decide(display())).ids).toEqual(['markTarget:near']);
            expect((await decide(display('far'))).ids).toEqual([]);
            expect((await decide(display('gone'))).ids).toEqual(['markTarget:near']);
        });

        it('never marks an ally, a neutral or an unscanned speck', async () => {
            const shown = display();
            (shown.radar as Radar).contacts = [
                ship('friend', 100, 1),
                { ...ship('neutral', 200), faction: -1 },
                { ...ship('speck', 300), scanLevel: 'UFO' },
            ];
            const { offered, ids } = await decide(shown);
            expect(offered).not.toContain('markTarget:speck');
            expect(ids).toEqual([]);
        });
    });
});
