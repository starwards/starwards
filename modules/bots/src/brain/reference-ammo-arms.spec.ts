import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_KNOB_DEFAULTS, setReferenceKnobs } from './reference-knobs';

import { BrainRequest } from './request';
import { Heard } from './callout';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = { commands: [{ command: 'changeGunAmmo', count: 1 }] };

function display(gun: string, lock: string | null = 'e1'): Display {
    return {
        panels: {
            'gun-status': [{ index: 0, projectile: gun, loadedProjectile: 'None', loadAmmo: true }],
            'targeting-status': { targetId: lock },
            'ammo-status': {
                fitted: true,
                ammo: {
                    HiExpShell: { count: 40, max: 100 },
                    ArmPenShell: { count: 40, max: 100 },
                    FragShell: { count: 40, max: 100 },
                },
            },
            'systems-status': [],
        },
        radar: { ownShip: { heading: 0, position: { x: 0, y: 0 } }, contacts: [] },
    };
}

const said = (facing: string, id = 'e1', model = 'composite', secondsAgo = 2): Heard => ({
    speaker: 'signals',
    callout: 'plate_intel',
    phrase: 'plates',
    values: { id, facing, model, holding: '3', total: '4' },
    secondsAgo,
});

async function gunChoice(policy: ReturnType<typeof makeReferencePolicy>, shown: Display, heard: Heard[] = []) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown, heard);
    return answers['changeGunAmmo:0']?.choice;
}

afterEach(() => setReferenceKnobs());

describe('weapons ammo policy arms', () => {
    it('all knobs off: the gun keeps what it has, whatever Signals said', async () => {
        expect(REFERENCE_KNOB_DEFAULTS).toMatchObject({ AMMO_INFORMED: 0, AMMO_HE_ONLY: 0, AMMO_AP_ONLY: 0 });
        expect(await gunChoice(makeReferencePolicy(1), display('HiExpShell'), [said('holding')])).toBe('wait');
    });

    it('informed: loads AP from a holding call, HE from a broken call', async () => {
        setReferenceKnobs({ AMMO_INFORMED: 1 });
        expect(await gunChoice(makeReferencePolicy(1), display('HiExpShell'), [said('holding')])).toBe('press');
        expect(await gunChoice(makeReferencePolicy(1), display('ArmPenShell'), [said('broken')])).toBe('press');
        expect(await gunChoice(makeReferencePolicy(1), display('HiExpShell'), [said('broken')])).toBe('wait');
    });

    it('informed: ignores a call about another contact or a stale one, and plays AP without any', async () => {
        setReferenceKnobs({ AMMO_INFORMED: 1 });
        expect(await gunChoice(makeReferencePolicy(1), display('ArmPenShell'), [said('broken', 'other')])).toBe('wait');
        expect(
            await gunChoice(makeReferencePolicy(1), display('ArmPenShell'), [said('broken', 'e1', 'composite', 60)]),
        ).toBe('wait');
        expect(await gunChoice(makeReferencePolicy(1), display('HiExpShell'))).toBe('press');
    });

    it('informed: AP against whipple even once its plates are broken', async () => {
        setReferenceKnobs({ AMMO_INFORMED: 1 });
        expect(await gunChoice(makeReferencePolicy(1), display('HiExpShell'), [said('broken', 'e1', 'whipple')])).toBe(
            'press',
        );
    });

    it('model-blind: AMMO_PLATE_STATE returns HE for a broken-facing whipple target', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.AMMO_PLATE_STATE).toBe(0);
        setReferenceKnobs({ AMMO_INFORMED: 1, AMMO_PLATE_STATE: 1 });
        expect(await gunChoice(makeReferencePolicy(1), display('HiExpShell'), [said('broken', 'e1', 'whipple')])).toBe(
            'wait',
        );
        expect(await gunChoice(makeReferencePolicy(1), display('ArmPenShell'), [said('broken', 'e1', 'whipple')])).toBe(
            'press',
        );
    });

    it('pure arms: HE-only and AP-only ignore the call and need no lock', async () => {
        setReferenceKnobs({ AMMO_HE_ONLY: 1 });
        expect(await gunChoice(makeReferencePolicy(1), display('ArmPenShell', null), [said('holding')])).toBe('press');
        expect(await gunChoice(makeReferencePolicy(1), display('HiExpShell', null))).toBe('wait');
        setReferenceKnobs({ AMMO_AP_ONLY: 1 });
        expect(await gunChoice(makeReferencePolicy(1), display('HiExpShell', null), [said('broken')])).toBe('press');
        expect(await gunChoice(makeReferencePolicy(1), display('ArmPenShell', null))).toBe('wait');
    });
});
