import { ammoLevel } from '../src/widgets/ammo-groups';

describe('ammoLevel', () => {
    it.each([
        [0, 8, 'EMPTY'],
        [1, 8, 'LOW'],
        [2, 8, 'LOW'],
        [3, 8, 'OK'],
        [0, 2000, 'EMPTY'],
        [500, 2000, 'LOW'],
        [501, 2000, 'OK'],
    ])('count %d of %d is %s', (count, max, expected) => {
        expect(ammoLevel(count, max)).toBe(expected);
    });
});
