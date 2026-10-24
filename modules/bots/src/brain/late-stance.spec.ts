import { calloutMemory, referenceCallout } from './reference-orders';
import { BrainRequest } from './request';
import { CALLOUT_QUESTION } from './callout';
import { Display } from './controls';
import { setReferenceKnobs } from './reference-knobs';

const request = {
    state: {},
    questions: {
        [CALLOUT_QUESTION]: {
            type: 'choice',
            instructions: '',
            criteria: { offensive: '', all_out: '', hold_here: '' },
        },
    },
} as unknown as BrainRequest;

const shown: Display = {
    panels: {},
    radar: { ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } }, contacts: [] },
};

/** The captain's calls, 5 s a decision, for `decisions` decisions. */
function play(decisions: number) {
    const state = calloutMemory();
    return Array.from(
        { length: decisions },
        () => referenceCallout(request, shown, undefined, 5, undefined, { state, heard: [] })?.choice,
    );
}

describe('late stance (LATE_STANCE_*)', () => {
    afterEach(() => setReferenceKnobs());

    it('is off by default', () => {
        const said = play(300);
        expect(said).not.toContain('offensive');
        expect(said).not.toContain('all_out');
    });

    it.each([
        [1, 'offensive', 'all_out'],
        [2, 'all_out', 'offensive'],
    ])('mode %d sets %s once, from LATE_STANCE_SECONDS on', (mode, stance, other) => {
        setReferenceKnobs({ LATE_STANCE_MODE: mode, LATE_STANCE_SECONDS: 50 });
        const said = play(40);
        expect(said.indexOf(stance)).toBe(9); // t=50
        expect(said.filter((c) => c === stance)).toHaveLength(1);
        expect(said).not.toContain(other);
    });
});
