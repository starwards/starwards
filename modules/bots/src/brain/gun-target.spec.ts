import { Contact, Radar } from './verbal';
import { gunPick } from './gun-target';
import { setReferenceKnobs } from './reference-knobs';

const ship = (name: string, x: number, y: number, faction: number, radius: number) =>
    ({
        id: name,
        name,
        type: 'Spaceship',
        scanLevel: 'BASIC',
        faction,
        radius,
        position: { x, y },
        distance: Math.hypot(x, y),
        bearing: 0,
    }) as unknown as Contact;
const station = (name: string, x: number, y: number) => ship(name, x, y, 1, 1200);
const raider = (name: string, x: number, y: number) => ship(name, x, y, 2, 20);
const radar = (...contacts: Contact[]) =>
    ({ ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } }, contacts }) as unknown as Radar;

describe('gunPick', () => {
    afterEach(() => setReferenceKnobs());

    it('mode 0 leaves the choice to current play', () => {
        expect(gunPick(radar(station('s', 50_000, 0), raider('r', 51_000, 0)))).toBeUndefined();
    });

    it('mode 1 prefers a raider 3 km from a station over a nearer one 6 km from it', () => {
        setReferenceKnobs({ GUN_TARGET_MODE: 1 });
        const r = radar(station('s', 50_000, 0), raider('far', 44_000, 0), raider('close', 53_000, 0));
        expect(gunPick(r)?.name).toBe('close');
    });

    it('mode 1 with no raider inside the radius leaves current play', () => {
        setReferenceKnobs({ GUN_TARGET_MODE: 1 });
        expect(gunPick(radar(station('s', 50_000, 0), raider('far', 44_000, 0)))).toBeUndefined();
    });

    it('mode 1 keeps the held raider while it stays inside the radius', () => {
        setReferenceKnobs({ GUN_TARGET_MODE: 1 });
        const held = raider('held', 52_000, 3_000);
        const r = radar(station('s', 50_000, 0), held, raider('nearer', 51_000, 0));
        expect(gunPick(r, held)?.name).toBe('held');
        expect(gunPick(r)?.name).toBe('nearer');
    });

    it('mode 2 picks the raider nearest the station the most raiders are on', () => {
        setReferenceKnobs({ GUN_TARGET_MODE: 2 });
        const r = radar(
            station('a', 50_000, 0),
            station('b', 50_000, 60_000),
            raider('a1', 50_000, 1_000),
            raider('b1', 50_000, 63_000),
            raider('b2', 51_000, 62_500),
        );
        expect(gunPick(r)?.name).toBe('b2');
    });
});
