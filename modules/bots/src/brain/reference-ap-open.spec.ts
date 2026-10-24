import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_KNOB_DEFAULTS, setReferenceKnobs } from './reference-knobs';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = {
    commands: [
        { command: 'changeGunAmmo', count: 1 },
        { command: 'changeTubeAmmo', count: 1 },
    ],
};

/** The gun on `gun`, an unloaded tube typed `tube`, `ap` AP shells left, locked on `lock`. */
function display(gun: string, tube: string, ap: number, lock: string | null = 'enemy'): Display {
    return {
        panels: {
            'gun-status': [{ index: 0, projectile: gun, loadedProjectile: 'None', loadAmmo: true }],
            'tubes-status': [{ index: 0, projectile: tube, loadedProjectile: 'None', loading: 0, bearing: 0 }],
            'targeting-status': { targetId: lock },
            'ammo-status': {
                fitted: true,
                ammo: {
                    HiExpShell: { count: 40, max: 100 },
                    ArmPenShell: { count: ap, max: 100 },
                    FragShell: { count: 40, max: 100 },
                    HiExpMissile: { count: 5, max: 10 },
                    ArmPenMissile: { count: 5, max: 10 },
                },
            },
            'systems-status': [],
        },
        radar: { ownShip: { heading: 0, position: { x: 0, y: 0 } }, contacts: [] },
    };
}

async function step(policy: ReturnType<typeof makeReferencePolicy>, shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown);
    return { gun: answers['changeGunAmmo:0']?.choice, tube: answers['changeTubeAmmo:0']?.choice };
}

afterEach(() => setReferenceKnobs());

describe('reference weapons AP opens, HE finishes (AMMO_OPEN_AP)', () => {
    it('is off by default: the gun keeps HE with AP in stock', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.AMMO_OPEN_AP).toBe(0);
        expect((await step(makeReferencePolicy(1), display('HiExpShell', 'HiExpMissile', 40))).gun).toBe('wait');
    });

    it('loads AP on a fresh lock, then HE once it spent AMMO_OPEN_AP_SHELLS AP shells on it', async () => {
        setReferenceKnobs({ AMMO_OPEN_AP: 1, AMMO_OPEN_AP_SHELLS: 4 });
        const policy = makeReferencePolicy(1);
        expect((await step(policy, display('HiExpShell', 'HiExpMissile', 40))).gun).toBe('press');
        expect((await step(policy, display('ArmPenShell', 'HiExpMissile', 37))).gun).toBe('wait');
        expect((await step(policy, display('ArmPenShell', 'HiExpMissile', 36))).gun).toBe('press');
        expect((await step(policy, display('HiExpShell', 'HiExpMissile', 36))).gun).toBe('wait');
    });

    it('starts the tally over on a new lock, and leaves the gun alone without one', async () => {
        setReferenceKnobs({ AMMO_OPEN_AP: 1, AMMO_OPEN_AP_SHELLS: 4 });
        const policy = makeReferencePolicy(1);
        await step(policy, display('ArmPenShell', 'HiExpMissile', 40));
        await step(policy, display('ArmPenShell', 'HiExpMissile', 30));
        expect((await step(policy, display('HiExpShell', 'HiExpMissile', 30, 'other'))).gun).toBe('press');
        expect((await step(policy, display('HiExpShell', 'HiExpMissile', 30, null))).gun).toBe('wait');
    });

    it('shells-only arm leaves the tubes alone; shells+missiles re-types the tube AP, then HE', async () => {
        setReferenceKnobs({ AMMO_OPEN_AP: 1 });
        expect((await step(makeReferencePolicy(1), display('ArmPenShell', 'HiExpMissile', 40))).tube).not.toBe('press');
        setReferenceKnobs({ AMMO_OPEN_AP: 2, AMMO_OPEN_AP_SHELLS: 4 });
        const policy = makeReferencePolicy(1);
        expect((await step(policy, display('ArmPenShell', 'HiExpMissile', 40))).tube).toBe('press');
        expect((await step(policy, display('ArmPenShell', 'ArmPenMissile', 40))).tube).toBe('wait');
        expect((await step(policy, display('ArmPenShell', 'ArmPenMissile', 30))).tube).toBe('press');
    });
});
