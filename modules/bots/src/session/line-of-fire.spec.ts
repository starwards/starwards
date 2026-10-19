import { lineOfFire } from './line-of-fire';

const station = (x: number, y: number, radius = 300) => ({
    id: 'station',
    name: 'station',
    position: { x, y },
    radius,
});

describe('line of fire', () => {
    const base = { position: { x: 0, y: 0 }, bearing: 0, reach: 8000, danger: 200 };

    it('is clear with no ally', () => {
        expect(lineOfFire({ ...base, target: { x: 4000, y: 0 }, allies: [] })).toEqual({
            allyInLine: null,
            allyNearTarget: null,
        });
    });

    it('shows an ally on the nose line inside the shells reach, even beyond the target', () => {
        const shown = lineOfFire({ ...base, target: { x: 4000, y: 0 }, allies: [station(7000, 300)] });
        expect(shown.allyInLine).toEqual({ id: 'station', name: 'station', distance: 7006 });
        expect(shown.allyNearTarget).toBeNull();
    });

    it('shows an ally on the line to the locked target for a missile, even off the nose', () => {
        const shown = lineOfFire({ ...base, bearing: 90, target: { x: 4000, y: 0 }, allies: [station(2000, 100)] });
        expect(shown.allyInLine?.id).toBe('station');
    });

    it('clears an ally well off the line, behind the ship, or beyond reach', () => {
        const allies = [station(3000, 2000), station(-3000, 0), station(9000, 0)];
        expect(lineOfFire({ ...base, target: { x: 4000, y: 0 }, allies }).allyInLine).toBeNull();
    });

    it('shows an ally within the danger radius of the target', () => {
        const shown = lineOfFire({ ...base, bearing: 90, target: { x: 4000, y: 0 }, allies: [station(4000, 450)] });
        expect(shown.allyNearTarget).toEqual({ id: 'station', name: 'station', distance: 450 });
    });
});
