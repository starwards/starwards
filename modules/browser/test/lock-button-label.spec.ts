import { lockButtonTitle } from '../src/panel/lock-button-label';

// A GM tweak-panel row's lock toggle is one of many identical-looking 🔒/🔓 buttons on the same
// panel (see gm-screen.spec.ts). #2168 labeled each one `"${field} locked"`/`"${field} unlocked"`
// so it's uniquely findable by accessible text; #2171 (merged instead, for root-cause reasons
// unrelated to this) dropped the field name from the title, leaving every row's button with the
// same bare glyph. `wireLockButton` (blades.ts) builds its title from this function.
describe('lockButtonTitle', () => {
    test('names the field and its unlocked state', () => {
        expect(lockButtonTitle('maneuveringMode', false)).toContain('maneuveringMode');
        expect(lockButtonTitle('maneuveringMode', false)).toMatch(/unlocked/);
    });

    test('names the field and its locked state', () => {
        expect(lockButtonTitle('offsetFactor', true)).toContain('offsetFactor');
        expect(lockButtonTitle('offsetFactor', true)).toMatch(/(?<!un)locked/);
    });

    test('two different fields get distinguishable titles', () => {
        expect(lockButtonTitle('velocity', true)).not.toEqual(lockButtonTitle('offsetFactor', true));
    });
});
