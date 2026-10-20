import { Capabilities, Display, stationControls } from './controls';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = {
    commands: [
        { command: 'fireTube', count: 2 },
        { command: 'tubeSafety', count: 2 },
        { command: 'fireChainGun', count: 1 },
    ],
};

type Tube = { loadedProjectile: string; loading: number; bearing: number; safetyLocked?: boolean };
const loaded = (bearing: number, loadedProjectile = 'HiExpMissile'): Tube => ({
    loadedProjectile,
    loading: 1,
    bearing,
});
const empty = (bearing: number): Tube => ({ loadedProjectile: 'None', loading: 0.3, bearing });

/** Own ship heading 0 at the origin; the locked ship `target` at `bearing` and `distance`, its position on the x axis. */
function display(tubes: Tube[], target: { bearing: number; distance: number } | null): Display {
    return {
        panels: {
            'tubes-status': tubes.map((t, index) => ({ index, safetyLocked: true, loadAmmo: true, ...t })),
            'targeting-status': { targetId: target ? 'enemy' : undefined },
            'systems-status': [],
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 } },
            contacts: target
                ? [
                      {
                          id: 'enemy',
                          type: 'Spaceship',
                          position: { x: target.distance, y: 0 },
                          scanLevel: 'BASIC',
                          ...target,
                      },
                  ]
                : [],
        },
    };
}

async function answers(shown: Display, policy = makeReferencePolicy(1)) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const result = await policy.answer({} as BrainRequest, controls, shown);
    return Object.fromEntries(Object.entries(result.answers).map(([id, a]) => [id, a.choice]));
}

describe('reference weapons tubes', () => {
    it('releases the safety of a loaded tube and fires it at a locked ship in range and arc', async () => {
        const choices = await answers(display([loaded(-90), loaded(90)], { bearing: 0, distance: 3000 }));
        expect(choices).toMatchObject({
            'tubeSafety:0': 'off',
            'fireTube:0': 'fire',
            'tubeSafety:1': 'on',
            'fireTube:1': 'hold_fire',
        });
    });

    it('fires the loaded tube, not the empty one', async () => {
        const choices = await answers(display([empty(-90), loaded(90)], { bearing: 0, distance: 3000 }));
        expect(choices).toMatchObject({ 'fireTube:0': 'hold_fire', 'tubeSafety:1': 'off', 'fireTube:1': 'fire' });
    });

    it('holds its tubes without a lock, out of range, or with the target behind the tube', async () => {
        for (const shown of [
            display([loaded(-90)], null),
            display([loaded(-90)], { bearing: 0, distance: 500 }),
            display([loaded(-90)], { bearing: 0, distance: 50_000 }),
            display([loaded(-90)], { bearing: 90, distance: 3000 }),
        ]) {
            expect(await answers(shown)).toMatchObject({ 'tubeSafety:0': 'on', 'fireTube:0': 'hold_fire' });
        }
    });

    it('fires HiExp at a still ship 30 km out, inside its 45 km envelope', async () => {
        expect(await answers(display([loaded(-90)], { bearing: 0, distance: 30_000 }))).toMatchObject({
            'fireTube:0': 'fire',
        });
    });

    it('holds HiExp but fires ArmPen at a ship opening at cruise speed 10 km out', async () => {
        for (const [ammo, choice] of [
            ['HiExpMissile', 'hold_fire'],
            ['ArmPenMissile', 'fire'],
        ]) {
            const policy = makeReferencePolicy(1);
            await answers(display([empty(-90)], { bearing: 0, distance: 9_400 }), policy);
            const opening = display([loaded(-90, ammo)], { bearing: 0, distance: 10_000 });
            expect(await answers(opening, policy)).toMatchObject({ 'fireTube:0': choice });
        }
    });

    it('waits between launches', async () => {
        const policy = makeReferencePolicy(1);
        const shown = display([loaded(-90), loaded(90)], { bearing: 0, distance: 3000 });
        expect(await answers(shown, policy)).toMatchObject({ 'fireTube:0': 'fire' });
        expect(await answers(shown, policy)).toMatchObject({ 'fireTube:0': 'hold_fire', 'fireTube:1': 'hold_fire' });
    });

    it('still fires the chain gun at a target on the nose', async () => {
        const choices = await answers(display([loaded(-90)], { bearing: 0, distance: 3000 }));
        expect(choices['fireChainGun:0']).toBe('fire');
    });
});
