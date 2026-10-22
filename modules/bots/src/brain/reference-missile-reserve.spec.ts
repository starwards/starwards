import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_KNOB_DEFAULTS, setReferenceKnobs } from './reference-knobs';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = {
    commands: [
        { command: 'fireTube', count: 1 },
        { command: 'tubeSafety', count: 1 },
    ],
};

/** A loaded HE tube dead ahead, the locked ship 3 km ahead, `missiles` HE missiles left in the magazine. */
function display(missiles: number): Display {
    return {
        panels: {
            'tubes-status': [
                {
                    index: 0,
                    safetyLocked: true,
                    loadAmmo: true,
                    loadedProjectile: 'HiExpMissile',
                    loading: 1,
                    bearing: 0,
                },
            ],
            'targeting-status': { targetId: 'enemy' },
            'ammo-status': { fitted: true, ammo: { HiExpMissile: { count: missiles, max: 12 } } },
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

async function fireTube(shown: Display, policy = makeReferencePolicy(1)) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const result = await policy.answer({} as BrainRequest, controls, shown);
    return result.answers['fireTube:0'].choice;
}

afterEach(() => setReferenceKnobs());

describe('reference weapons missile reserve', () => {
    it('is off by default: launches with an empty magazine behind the loaded round', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.MISSILE_RESERVE).toBe(0);
        expect(await fireTube(display(0))).toBe('fire');
    });

    it('MISSILE_RESERVE holds launches that leave fewer of the type, until MISSILE_RESERVE_SECONDS', async () => {
        setReferenceKnobs({ MISSILE_RESERVE: 4, MISSILE_RESERVE_SECONDS: 20 });
        expect(await fireTube(display(4))).toBe('fire');
        expect(await fireTube(display(3))).toBe('hold_fire');
        const policy = makeReferencePolicy(1);
        for (let i = 1; i < 20; i++) expect(await fireTube(display(3), policy)).toBe('hold_fire');
        expect(await fireTube(display(3), policy)).toBe('fire');
    });
});
