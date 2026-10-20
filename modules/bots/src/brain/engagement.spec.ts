import { Contact, Radar } from './verbal';

import { launchRange } from './engagement';
import { missileLaunchRange } from './missile-envelope';

const enemy = (x: number): Contact => ({
    id: 'raider',
    name: 'raider',
    scanLevel: 'BASIC',
    distance: x,
    bearing: 0,
    position: { x, y: 0 },
});
const radar = (ownX: number, enemyX: number): Radar => ({
    ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: ownX, y: 0 } },
    contacts: [enemy(enemyX - ownX)].map((c) => ({ ...c, position: { x: enemyX, y: 0 } })),
});

describe('launchRange', () => {
    it('reads a still enemy as still while the own ship flies at it', () => {
        const before = radar(0, 50_000);
        const now = radar(4_000, 50_000);
        expect(launchRange(now.contacts![0], now, before, 10)).toBe(missileLaunchRange('HiExpMissile', 0));
    });

    it('reads a still enemy as still while the own ship backs off', () => {
        const before = radar(0, 50_000);
        const now = radar(-4_000, 50_000);
        expect(launchRange(now.contacts![0], now, before, 10)).toBe(missileLaunchRange('HiExpMissile', 0));
    });

    it('reads an enemy flying at the own ship as closing at its own speed', () => {
        const before = radar(0, 66_000);
        const now = radar(0, 60_000);
        expect(launchRange(now.contacts![0], now, before, 10)).toBe(missileLaunchRange('HiExpMissile', 600));
    });
});
