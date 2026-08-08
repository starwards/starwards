import { resolveShipBlipAsset } from '../src/radar/blips/ship-blip-assets';

describe('resolveShipBlipAsset', () => {
    test('a model with a mapped asset resolves to that asset', () => {
        expect(resolveShipBlipAsset('large-station')).toBe('station');
        expect(resolveShipBlipAsset('small-station')).toBe('station');
    });

    test('an unmapped model falls back to the shared fighter asset', () => {
        expect(resolveShipBlipAsset('dragonfly-MK1')).toBe('fighter');
        expect(resolveShipBlipAsset('predator')).toBe('fighter');
    });

    test('no model (not yet synced) falls back to the shared fighter asset', () => {
        expect(resolveShipBlipAsset(null)).toBe('fighter');
    });
});
