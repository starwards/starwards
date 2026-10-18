import { Capabilities, Display, stationControls } from './controls';
import { GivenOrder, ORDERS_PANEL, orderFromCallout } from '../crew/orders';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';
import { testBoard } from '../crew/orders.fixtures';

const helmsCapabilities: Capabilities = {
    commands: ['rotation', 'strafe', 'boost', 'antiDrift', 'rotationMode'].map((command) => ({ command })),
};

type Seen = { id: string; name?: string; distance: number; bearing: number; faction?: number };

/** A ship at the origin facing 0°, of faction 1, in the given smart-pilot rotation mode. */
function helmsDisplay(contacts: Seen[] = [], rotationMode = 1): Display {
    return {
        panels: {
            'helms-stats': {
                rotationMode,
                maneuveringMode: 1,
                rotationCommand: 0,
                maneuveringCommand: { x: 0, y: 0 },
                antiDrift: 0,
            },
        },
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: contacts.map((c) => ({
                name: c.id,
                type: 'Spaceship',
                scanLevel: 'BASIC',
                radius: 50,
                position: {
                    x: c.distance * Math.cos((c.bearing * Math.PI) / 180),
                    y: c.distance * Math.sin((c.bearing * Math.PI) / 180),
                },
                ...c,
            })),
        },
    };
}

const closeTo = orderFromCallout(
    'close_to',
    { name: 'raider', range: '18', distance: '50.0', bearing: '090' },
    { x: 0, y: 0 },
);
const holdHere: GivenOrder = { kind: 'hold_here' };
const engage = (name: string): GivenOrder => ({ kind: 'engage', params: { target: { name } } });

async function choices(
    display: Display,
    capabilities: Capabilities,
    orders: GivenOrder[] = [],
    policy = makeReferencePolicy(1),
) {
    const shown = orders.length
        ? { ...display, panels: { ...display.panels, [ORDERS_PANEL]: testBoard().give(orders).shown } }
        : display;
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown, []);
    return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
}

describe('reference crew under captain orders', () => {
    it('helms turns and flies toward missile range on the ordered bearing', async () => {
        expect(await choices(helmsDisplay(), helmsCapabilities, [closeTo])).toMatchObject({
            rotation: 'right',
            strafe: 'right',
            boost: 'hold',
            antiDrift: 'release',
        });
    });

    it('helms burns the afterburner on a long run to the ordered point once the nose bears on it', async () => {
        const afterBurner: Capabilities = { commands: [{ command: 'afterBurner' }] };
        const facing = (heading: number): Display => {
            const shown = helmsDisplay();
            return {
                ...shown,
                radar: { ...(shown.radar as object), ownShip: { heading, faction: 1, position: { x: 0, y: 0 } } },
            };
        };
        expect(await choices(facing(90), afterBurner, [closeTo])).toMatchObject({ afterBurner: 'engage' });
        expect(await choices(facing(0), afterBurner, [closeTo])).toMatchObject({ afterBurner: 'release' });
        const near = orderFromCallout(
            'close_to',
            { name: 'raider', range: '18', distance: '19.0', bearing: '090' },
            { x: 0, y: 0 },
        );
        expect(await choices(facing(90), afterBurner, [near])).toMatchObject({ afterBurner: 'release' });
    });

    it('helms flies the maneuver order on the board until another replaces it', async () => {
        expect(await choices(helmsDisplay(), helmsCapabilities, [closeTo])).toMatchObject({ strafe: 'right' });
        expect(await choices(helmsDisplay(), helmsCapabilities, [closeTo, holdHere])).toMatchObject({
            strafe: 'hold',
            antiDrift: 'engage',
        });
    });

    it('helms stops the ship drifting with no order and nothing to fly after', async () => {
        expect(await choices(helmsDisplay(), helmsCapabilities)).toMatchObject({ antiDrift: 'engage', boost: 'hold' });
    });

    it('helms holds on a hold order even with the nose locked on a target', async () => {
        expect(await choices(helmsDisplay([], 2), helmsCapabilities, [holdHere])).toMatchObject({
            antiDrift: 'engage',
            boost: 'hold',
        });
    });

    it('helms flies after enemies only, not an identified ally on its radar', async () => {
        const ally = { id: 'picket', distance: 2000, bearing: 90, faction: 1 };
        expect(await choices(helmsDisplay([ally]), helmsCapabilities)).toMatchObject({
            rotation: 'centre',
            antiDrift: 'engage',
        });
        const enemy = { id: 'raider', distance: 2000, bearing: 90, faction: 2 };
        expect(await choices(helmsDisplay([enemy]), helmsCapabilities)).toMatchObject({
            rotation: 'right',
            antiDrift: 'release',
        });
    });

    it('weapons cycles its lock off an ally and onto the ship the captain names', async () => {
        const weapons: Capabilities = { commands: [{ command: 'nextTarget' }] };
        const locked = (id: string, faction: number): Display => ({
            ...helmsDisplay([{ id, distance: 15_000, bearing: 0, faction }]),
            panels: { 'targeting-status': { targetId: id } },
        });
        expect(await choices(locked('picket', 1), weapons)).toMatchObject({ target: 'next' });
        expect(await choices(locked('raider-2', 2), weapons, [engage('raider')])).toMatchObject({ target: 'next' });
        expect(await choices(locked('raider', 2), weapons, [engage('raider')])).toMatchObject({ target: 'none' });
    });

    it('engineer powers the tubes once the captain orders an attack', async () => {
        const engineer: Capabilities = { commands: [{ command: 'systemPower', systems: ['/tubes/0'] }] };
        const shown: Display = {
            panels: {
                'engineering-status': { energy: 1000, maxEnergy: 1000, energyCells: 0 },
                'full-systems-status': [{ pointer: '/tubes/0', power: 0, coolantFactor: 0, heat: 0 }],
                'damage-report': [],
                'armor-status': { numberOfPlates: 10, healthyPlates: 10 },
            },
        };
        expect(await choices(shown, engineer)).toMatchObject({ 'systemPower:/tubes/0': 'hold' });
        expect(await choices(shown, engineer, [engage('raider')])).toMatchObject({ 'systemPower:/tubes/0': 'raise' });
    });
});
