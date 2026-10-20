import { Capabilities, Display, stationControls } from './controls';

import { BrainRequest } from './request';
import { CALLOUT_QUESTION } from './callout';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = { commands: [{ command: 'beamDirection' }, { command: 'beamArc' }] };

type Seen = { id: string; bearing: number; distance: number; scanLevel: string; radius?: number; faction?: number };

function display(beamBearing: number, contacts: Seen[], heading = 0): Display {
    return {
        panels: {},
        radar: {
            ownShip: { id: 'GVTS', heading },
            scanBeam: { bearing: beamBearing, arc: 20, range: 5000 },
            contacts: contacts.map((c) => ({ name: c.id, type: 'Spaceship', position: { x: 0, y: 0 }, ...c })),
        },
    };
}

async function beam(shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 2 });
    const { answers } = await makeReferencePolicy(2).answer({} as BrainRequest, controls, shown);
    return answers['beamDirection']?.choice;
}

describe('reference signals', () => {
    it('steers the beam toward the nearest ship below FULL, relative to the nose', async () => {
        const ships = [
            { id: 'far', bearing: 270, distance: 4000, scanLevel: 'BASIC' },
            { id: 'near', bearing: 120, distance: 2000, scanLevel: 'BASIC' },
        ];
        expect(await beam(display(0, ships, 90))).toBe('right');
        expect(await beam(display(60, ships, 90))).toBe('left');
        expect(await beam(display(30, ships, 90))).toBe('hold');
    });

    it('skips ships already scanned to FULL', async () => {
        const ships = [
            { id: 'done', bearing: 10, distance: 1000, scanLevel: 'FULL' },
            { id: 'next', bearing: -90, distance: 3000, scanLevel: 'UFO' },
        ];
        expect(await beam(display(0, ships))).toBe('left');
    });

    it('calls out the enemy position whenever an identified enemy ship is shown, and nothing else', async () => {
        const request = {
            state: {},
            questions: {
                [CALLOUT_QUESTION]: { type: 'choice', instructions: '', criteria: { enemy_position: '', silence: '' } },
            },
        } as BrainRequest;
        const callout = async (shown: Display) =>
            (await makeReferencePolicy(2).answer(request, [], shown)).answers[CALLOUT_QUESTION]?.choice;
        const enemy = { id: 'raider', bearing: 0, distance: 40_000, scanLevel: 'BASIC', faction: 2 };
        const ally = { id: 'picket', bearing: 0, distance: 30_000, scanLevel: 'BASIC', faction: 1 };
        const own = (shown: Display) => ({
            ...shown,
            radar: { ...(shown.radar as object), ownShip: { id: 'GVTS', heading: 0, faction: 1 } },
        });

        expect(await callout(own(display(0, [ally, enemy])))).toBe('enemy_position');
        expect(await callout(own(display(0, [ally])))).toBe('silence');
    });

    it('holds the beam when every ship is scanned', async () => {
        expect(await beam(display(0, [{ id: 'done', bearing: 90, distance: 1000, scanLevel: 'FULL' }]))).toBe('hold');
    });
});
