import { Capabilities, Display, stationControls } from './controls';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';
import { setReferenceKnobs } from './reference-knobs';

const capabilities: Capabilities = { commands: [{ command: 'changeGunAmmo', count: 1 }] };

function display(projectile: string, counts: Record<string, number>): Display {
    return {
        panels: {
            'gun-status': [{ index: 0, projectile, loadedProjectile: 'None', loadAmmo: true }],
            'ammo-status': {
                fitted: true,
                ammo: Object.fromEntries(Object.entries(counts).map(([t, count]) => [t, { count, max: 100 }])),
            },
            'systems-status': [],
        },
        radar: { ownShip: { heading: 0, position: { x: 0, y: 0 } }, contacts: [] },
    };
}

async function choice(shown: Display, shellPreference?: readonly string[]) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const policy = makeReferencePolicy(1, undefined, 'reference', undefined, shellPreference);
    const result = await policy.answer({} as BrainRequest, controls, shown);
    return result.answers['changeGunAmmo:0']?.choice;
}

describe('reference weapons gun ammo', () => {
    it('changes ammo once the loaded shell type runs dry and another has stock', async () => {
        expect(await choice(display('HiExpShell', { HiExpShell: 0, ArmPenShell: 40, FragShell: 0 }))).toBe('press');
    });

    it('keeps the loaded type while it has stock, or when no other shell type has any', async () => {
        expect(await choice(display('HiExpShell', { HiExpShell: 5, ArmPenShell: 40 }))).toBe('wait');
        expect(await choice(display('HiExpShell', { HiExpShell: 0, ArmPenShell: 0, HiExpMissile: 3 }))).toBe('wait');
    });

    describe('with a shell preference', () => {
        const preference = ['HiExpShell', 'FragShell', 'ArmPenShell'];
        const stock = { HiExpShell: 0, ArmPenShell: 40, FragShell: 40 };

        it('changes ammo while the loaded type is not the first preferred type with stock', async () => {
            expect(await choice(display('ArmPenShell', stock), preference)).toBe('press');
            expect(await choice(display('HiExpShell', stock), preference)).toBe('press');
            expect(await choice(display('FragShell', { ...stock, HiExpShell: 3 }), preference)).toBe('press');
        });

        it('keeps the loaded type once it is the first preferred type with stock', async () => {
            expect(await choice(display('FragShell', stock), preference)).toBe('wait');
            expect(await choice(display('HiExpShell', { ...stock, HiExpShell: 3 }), preference)).toBe('wait');
        });

        it('leaves the choice to the loaded type running dry when no preferred type has stock', async () => {
            const onlyArmPen = { HiExpShell: 0, ArmPenShell: 40, FragShell: 0 };
            expect(await choice(display('ArmPenShell', onlyArmPen), ['HiExpShell'])).toBe('wait');
            expect(await choice(display('FragShell', onlyArmPen), ['HiExpShell'])).toBe('press');
        });
    });

    describe('FRAG_FIRST_SECONDS', () => {
        afterEach(() => setReferenceKnobs());
        const stock = { HiExpShell: 40, ArmPenShell: 40, FragShell: 40 };

        it('loads Frag before HE and AP until that many seconds', async () => {
            setReferenceKnobs({ FRAG_FIRST_SECONDS: 10 });
            expect(await choice(display('HiExpShell', stock))).toBe('press');
            expect(await choice(display('FragShell', stock))).toBe('wait');
            expect(await choice(display('FragShell', { ...stock, FragShell: 0 }))).toBe('press');
        });

        it('leaves the loaded type alone once the time passed', async () => {
            setReferenceKnobs({ FRAG_FIRST_SECONDS: 0.5 });
            expect(await choice(display('HiExpShell', stock))).toBe('wait');
        });
    });
});
