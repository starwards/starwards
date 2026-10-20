import { Capabilities, Display, stationControls } from './controls';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

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

async function choice(shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const result = await makeReferencePolicy(1).answer({} as BrainRequest, controls, shown);
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
});
