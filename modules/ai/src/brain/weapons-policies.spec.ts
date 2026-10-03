import { Capabilities, Display, stationControls } from './controls';
import { SCRIPTED_SEAT_POLICIES, ScriptedSeatPolicyName, makeScriptedSeatPolicy } from './weapons-policies';

import { BrainRequest } from './request';

const capabilities: Capabilities = {
    commands: [
        { command: 'nextTarget' },
        { command: 'clearTarget' },
        { command: 'fireChainGun', count: 1 },
        { command: 'changeGunAmmo', count: 1 },
        { command: 'systemPower', systems: ['/reactor', '/tubes/0'] },
    ],
};

/** The enemy 3 km dead ahead, the nose on it; `locked` whether weapons holds it as the target. */
function display(locked: boolean, projectile = 'HiExpShell', bearing = 0): Display {
    return {
        panels: {
            'targeting-status': locked ? { targetId: 'enemy' } : {},
            'gun-status': [{ index: 0, projectile }],
            'systems-status': [],
            'full-systems-status': [
                { pointer: '/reactor', power: 0.5, coolantFactor: 0, heat: 0 },
                { pointer: '/tubes/0', power: 0, coolantFactor: 0, heat: 0 },
            ],
            'engineering-status': { energy: 1000, maxEnergy: 1000, energyCells: 2 },
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 } },
            contacts: [
                { id: 'enemy', distance: 3000, bearing, position: { x: 3000, y: 0 }, type: 'Spaceship', radius: 11 },
            ],
        },
    };
}

async function choices(name: ScriptedSeatPolicyName, shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 0.5 });
    const { answers } = await makeScriptedSeatPolicy(name, 0.5).answer({} as BrainRequest, controls, shown);
    return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
}

describe('scripted weapons officers', () => {
    it('are all known', () => {
        expect([...SCRIPTED_SEAT_POLICIES]).toEqual(['spray-fire', 'wrong-ammo', 'no-lock', 'tubes-powered']);
    });

    it('spray-fire fires with the nose off the target, where the reference holds', async () => {
        expect((await choices('spray-fire', display(true, 'HiExpShell', 90)))['fireChainGun:0']).toBe('fire');
    });

    it('wrong-ammo cycles the gun to Frag shells, then fires them like the reference', async () => {
        expect((await choices('wrong-ammo', display(true)))['changeGunAmmo:0']).toBe('press');
        const frag = await choices('wrong-ammo', display(true, 'FragShell'));
        expect(frag['changeGunAmmo:0']).toBe('wait');
        expect(frag['fireChainGun:0']).toBe('fire');
    });

    it('no-lock never takes a target, clears one it holds, and fires on the nearest ship in the arc', async () => {
        expect((await choices('no-lock', display(false)))['target']).toBe('none');
        expect((await choices('no-lock', display(true)))['target']).toBe('clear');
        expect((await choices('no-lock', display(false)))['fireChainGun:0']).toBe('fire');
    });

    it('tubes-powered runs the reference engineer but keeps the tubes at normal power while the store is above half', async () => {
        expect((await choices('tubes-powered', display(true)))['systemPower:/tubes/0']).toBe('raise');
        const low = display(true);
        (low.panels['engineering-status'] as { energy: number }).energy = 300;
        const lowFull = {
            ...low,
            panels: {
                ...low.panels,
                'full-systems-status': [
                    { pointer: '/reactor', power: 0.5, coolantFactor: 0, heat: 0 },
                    { pointer: '/tubes/0', power: 0.5, coolantFactor: 0, heat: 0 },
                ],
            },
        };
        expect((await choices('tubes-powered', lowFull))['systemPower:/tubes/0']).toBe('lower');
    });
});
