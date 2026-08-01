import { ScanLevel } from '../src';
import { expect } from 'chai';

/**
 * The numeric values are the contract, not the member names: scanLevels is a uint8 array on the
 * wire, GM tweak dropdowns select by index, and saved games carry raw numbers. A renumber that
 * keeps the names compiles clean and silently changes what every persisted 2 means.
 */
describe('ScanLevel', () => {
    it('pins each tier to its wire value', () => {
        expect(ScanLevel.UFO).to.equal(0);
        expect(ScanLevel.BASIC).to.equal(1);
        expect(ScanLevel.SNAPSHOT).to.equal(2);
        expect(ScanLevel.FULL).to.equal(3);
    });

    it('orders the tiers so that comparisons gate correctly', () => {
        expect(ScanLevel.UFO).to.be.lessThan(ScanLevel.BASIC);
        expect(ScanLevel.BASIC).to.be.lessThan(ScanLevel.SNAPSHOT);
        expect(ScanLevel.SNAPSHOT).to.be.lessThan(ScanLevel.FULL);
    });
});
