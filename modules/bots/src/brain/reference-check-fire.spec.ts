import { BrainRequest, displayFor } from './request';
import { Capabilities, Display, stationControls } from './controls';

import { BrainSpec } from './spec';
import { CALLOUT_QUESTION } from './callout';
import { makeReferencePolicy } from './reference-policy';
import { verbalReader } from './verbal';

const capabilities: Capabilities = {
    commands: [
        { command: 'fireTube', count: 1 },
        { command: 'tubeSafety', count: 1 },
        { command: 'fireChainGun', count: 1 },
    ],
};

const ally = { id: 'station', name: 'station', distance: 7000 };

/** A locked enemy dead on the nose at 3 km, a loaded tube on the nose, and the targeting panel's check-fire line. */
function display(checkFire: { allyInLine?: typeof ally | null; allyNearTarget?: typeof ally | null }): Display {
    return {
        panels: {
            'tubes-status': [
                { index: 0, loadedProjectile: 'HiExpMissile', loading: 1, bearing: 0, safetyLocked: true },
            ],
            'targeting-status': { targetId: 'enemy', allyInLine: null, allyNearTarget: null, ...checkFire },
            'systems-status': [],
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 } },
            contacts: [
                {
                    id: 'enemy',
                    type: 'Spaceship',
                    position: { x: 3000, y: 0 },
                    scanLevel: 'BASIC',
                    bearing: 0,
                    distance: 3000,
                },
            ],
        },
    };
}

async function answers(shown: Display) {
    const policy = makeReferencePolicy(1);
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const result = await policy.answer({} as BrainRequest, controls, shown);
    return Object.fromEntries(Object.entries(result.answers).map(([id, a]) => [id, a.choice]));
}

describe('reference weapons check fire', () => {
    it('fires gun and tube when the line of fire is clear', async () => {
        expect(await answers(display({}))).toMatchObject({ 'fireChainGun:0': 'fire', 'fireTube:0': 'fire' });
    });

    it('holds gun and tube while the targeting panel shows an ally in the line of fire', async () => {
        expect(await answers(display({ allyInLine: ally }))).toMatchObject({
            'fireChainGun:0': 'hold_fire',
            'fireTube:0': 'hold_fire',
            'tubeSafety:0': 'on',
        });
    });

    it('holds gun and tube while an ally lies inside the blast at the target', async () => {
        expect(await answers(display({ allyNearTarget: { ...ally, distance: 300 } }))).toMatchObject({
            'fireChainGun:0': 'hold_fire',
            'fireTube:0': 'hold_fire',
        });
    });
});

describe('check-fire line by brain version', () => {
    const spec = (checkFire?: boolean) => ({ ...(checkFire ? { checkFire } : {}) }) as BrainSpec;
    const shown = display({ allyInLine: ally });

    it('is left out of the display of a brain that does not opt in', () => {
        expect(displayFor(spec(), shown).panels['targeting-status']).toEqual({ targetId: 'enemy' });
        expect(displayFor(spec(true), shown)).toBe(shown);
    });

    it('is read out to a verbal brain that opts in', () => {
        expect(verbalReader(1, { checkFire: true })(shown)).toContain(
            'CHECK FIRE: ally station in the line of fire, 7,000 m.',
        );
        expect(verbalReader(1, { checkFire: true })(display({}))).toContain('Line of fire clear of allies.');
        expect(verbalReader(1)(shown).join(' ')).not.toContain('CHECK FIRE');
    });
});

describe('reference weapons check-fire callouts', () => {
    const request = {
        questions: { [CALLOUT_QUESTION]: { criteria: { check_fire: '', line_clear: '', silence: '' } } },
    } as unknown as BrainRequest;

    it('calls check fire when the line shows an ally, and line clear once it clears', async () => {
        const policy = makeReferencePolicy(1);
        const say = async (shown: Display) =>
            (await policy.answer(request, [], shown)).answers[CALLOUT_QUESTION]?.choice;
        expect(await say(display({ allyInLine: ally }))).toBe('check_fire');
        expect(await say(display({ allyInLine: ally }))).toBe('silence');
        expect(await say(display({}))).toBe('line_clear');
        expect(await say(display({}))).toBe('silence');
    });
});
