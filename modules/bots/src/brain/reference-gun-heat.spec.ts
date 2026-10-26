import { Capabilities, Display, stationControls } from './controls';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';
import { setReferenceKnobs } from './reference-knobs';

const capabilities: Capabilities = { commands: [{ command: 'fireChainGun', count: 1 }] };

type GunHeat = { coolantFactor?: number; heat?: number; jammedSeconds?: number; cooling?: boolean; jamBar?: number };

function display(gun: GunHeat): Display {
    return {
        panels: {
            'gun-status': [{ index: 0, projectile: 'HiExpShell', loadedProjectile: 'HiExpShell', ...gun }],
            'targeting-status': { targetId: 't' },
            'systems-status': [],
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 } },
            contacts: [
                {
                    id: 't',
                    type: 'Spaceship',
                    bearing: 0,
                    distance: 500,
                    scanLevel: 'BASIC',
                    position: { x: 500, y: 0 },
                },
            ],
        },
    };
}

async function choice(shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const policy = makeReferencePolicy(1);
    const result = await policy.answer({} as BrainRequest, controls, shown);
    return result.answers['fireChainGun:0']?.choice;
}

describe('reference weapons gun heat', () => {
    afterEach(() => setReferenceKnobs({}));

    it('fires a cool gun', async () => {
        expect(await choice(display({ heat: 10, jamBar: 80, jammedSeconds: 0, cooling: false }))).toBe('fire');
    });

    it('keeps master behaviour with the margin knob at its default: a gun near its jam bar still fires', async () => {
        expect(await choice(display({ heat: 79, jamBar: 80 }))).toBe('fire');
    });

    describe('with GUN_HOLD_MARGIN set', () => {
        beforeEach(() => setReferenceKnobs({ GUN_HOLD_MARGIN: 5 }));

        it('holds fire when heat nears the jam bar, however worn the barrel', async () => {
            expect(await choice(display({ heat: 77, jamBar: 80 }))).toBe('hold_fire');
            expect(await choice(display({ heat: 57, jamBar: 60 }))).toBe('hold_fire');
            expect(await choice(display({ heat: 40, jamBar: 60 }))).toBe('fire');
        });

        it('holds fire exactly at the margin from the jam bar, and not a degree below', async () => {
            expect(await choice(display({ heat: 75, jamBar: 80 }))).toBe('hold_fire');
            expect(await choice(display({ heat: 74, jamBar: 80 }))).toBe('fire');
        });

        it('fires when the jam bar is unknown', async () => {
            expect(await choice(display({ heat: 99 }))).toBe('fire');
        });

        it('ignores the margin when there is no coolant to shed heat', async () => {
            expect(await choice(display({ heat: 79, jamBar: 80, coolantFactor: 0 }))).toBe('fire');
        });
    });

    it('holds fire while jammed or in forced cooldown', async () => {
        expect(await choice(display({ heat: 10, jamBar: 80, jammedSeconds: 3 }))).toBe('hold_fire');
        expect(await choice(display({ heat: 75, jamBar: 80, cooling: true }))).toBe('hold_fire');
    });

    it('holds fire in forced cooldown at low heat', async () => {
        expect(await choice(display({ heat: 5, cooling: true }))).toBe('hold_fire');
    });

    it('still gates on the systems panel heat, as before', async () => {
        const shown = display({ heat: 10 });
        shown.panels['systems-status'] = [{ pointer: '/chainGuns/0', power: 1, coolantFactor: 1, heat: 90 }] as never;
        expect(await choice(shown)).toBe('hold_fire');
    });
});
