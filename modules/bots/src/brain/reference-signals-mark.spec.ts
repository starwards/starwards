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

const locked = (name: string): Heard => ({
    speaker: 'weapons',
    callout: 'target_locked',
    phrase: `target locked on ${name}`,
    values: { name },
    secondsAgo: 1,
});

async function pressed(shown: Display, heard: Heard[] = []) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await makeReferencePolicy(1).answer({} as BrainRequest, controls, shown, heard);
    return {
        ids: Object.keys(answers).filter((id) => answers[id]?.choice === 'press'),
        sent: controls.flatMap((c) => (answers[c.id]?.choice === 'press' ? [c.press('press')] : [])),
    };
}

afterEach(() => setReferenceKnobs());

describe('signals markTarget', () => {
    it('knob off by default: never marks', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.SIGNALS_MARK_LOCK).toBe(0);
        expect((await pressed(display(), [locked('far')])).ids).toEqual([]);
    });

    it('knob on: marks the contact weapons locked', async () => {
        setReferenceKnobs({ SIGNALS_MARK_LOCK: 1 });
        const { sent } = await pressed(display(), [locked('far')]);
        expect(sent).toEqual([{ command: 'markTarget', args: {}, value: 'far' }]);
    });

    it('knob on, no lock heard: marks the nearest enemy; nothing once it is marked', async () => {
        setReferenceKnobs({ SIGNALS_MARK_LOCK: 1 });
        expect((await pressed(display())).ids).toEqual(['markTarget:near']);
        expect((await pressed(display('near'))).ids).toEqual([]);
        expect((await pressed(display('near'), [locked('far')])).ids).toEqual(['markTarget:far']);
    });
});
