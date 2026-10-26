import { Capabilities, Display, stationControls } from './controls';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = { commands: [{ command: 'fireChainGun', count: 1 }] };

type GunHeat = { heat?: number; jammedSeconds?: number; cooling?: boolean; jamBar?: number };

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
    it('fires a cool gun', async () => {
        expect(await choice(display({ heat: 10, jamBar: 80, jammedSeconds: 0, cooling: false }))).toBe('fire');
    });

    it('holds fire when heat nears the jam bar, however worn the barrel', async () => {
        expect(await choice(display({ heat: 77, jamBar: 80 }))).toBe('hold_fire');
        expect(await choice(display({ heat: 57, jamBar: 60 }))).toBe('hold_fire');
        expect(await choice(display({ heat: 40, jamBar: 60 }))).toBe('fire');
    });

    it('holds fire while jammed or in forced cooldown', async () => {
        expect(await choice(display({ heat: 10, jamBar: 80, jammedSeconds: 3 }))).toBe('hold_fire');
        expect(await choice(display({ heat: 75, jamBar: 80, cooling: true }))).toBe('hold_fire');
    });
});
