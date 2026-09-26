import { Maneuvering } from '../src/ship/maneuvering';
import { expect } from 'chai';

describe('Maneuvering.broken', () => {
    it('reads the threshold the same before and after a float32 round trip', () => {
        const maneuvering = new Maneuvering();
        // eight 0.1 steps from 1 leave 0.19999999999999968 live
        maneuvering.efficiency = 1 - 8 * 0.1;
        expect(maneuvering.broken).to.equal(true);
        // the synced float32 field stores it as 0.2000000029802322
        maneuvering.efficiency = Math.fround(maneuvering.efficiency);
        expect(maneuvering.broken).to.equal(true);
    });

    it('is intact one limitPercision quantum above the threshold', () => {
        const maneuvering = new Maneuvering();
        maneuvering.efficiency = 0.2001;
        expect(maneuvering.broken).to.equal(false);
        maneuvering.efficiency = Math.fround(0.2001);
        expect(maneuvering.broken).to.equal(false);
    });

    it('is intact one step above the threshold', () => {
        const maneuvering = new Maneuvering();
        maneuvering.efficiency = Math.fround(0.3);
        expect(maneuvering.broken).to.equal(false);
    });
});
