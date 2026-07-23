import { SCAN_BEAM_MAX_ARC_DEG, SCAN_BEAM_MAX_RADIUS, calcScanBeamGeometry } from '../src';

import { expect } from 'chai';

function sectorArea(arcDeg: number, radius: number) {
    return 0.5 * (arcDeg * (Math.PI / 180)) * radius * radius;
}

describe('calcScanBeamGeometry', () => {
    const beamArea = sectorArea(20, 10_000); // an area comfortably within the valid shape range

    it('keeps sector area invariant across shape values', () => {
        for (const shape of [0, 0.25, 0.5, 0.75, 1]) {
            const { arc, radius } = calcScanBeamGeometry(beamArea, shape);
            expect(sectorArea(arc, radius)).to.be.closeTo(beamArea, beamArea * 0.001);
        }
    });

    it('never exceeds the max arc', () => {
        for (const shape of [0, 0.1, 0.5, 0.9, 1]) {
            const { arc } = calcScanBeamGeometry(beamArea, shape);
            expect(arc).to.be.at.most(SCAN_BEAM_MAX_ARC_DEG);
        }
    });

    it('never exceeds the max radius', () => {
        for (const shape of [0, 0.1, 0.5, 0.9, 1]) {
            const { radius } = calcScanBeamGeometry(beamArea, shape);
            expect(radius).to.be.at.most(SCAN_BEAM_MAX_RADIUS);
        }
    });

    it('shape=0 is wide-and-short: arc at its max, radius at its minimum', () => {
        const { arc, radius } = calcScanBeamGeometry(beamArea, 0);
        expect(arc).to.be.closeTo(SCAN_BEAM_MAX_ARC_DEG, 0.01);
        const { radius: radiusAtHalf } = calcScanBeamGeometry(beamArea, 0.5);
        expect(radius).to.be.lessThan(radiusAtHalf);
    });

    it('shape=1 is narrow-and-long: radius at its max', () => {
        const { radius, arc } = calcScanBeamGeometry(beamArea, 1);
        expect(radius).to.be.closeTo(SCAN_BEAM_MAX_RADIUS, 0.01);
        const { arc: arcAtHalf } = calcScanBeamGeometry(beamArea, 0.5);
        expect(arc).to.be.lessThan(arcAtHalf);
    });

    it('radius grows monotonically (and arc shrinks) as shape increases', () => {
        let prevRadius = -Infinity;
        let prevArc = Infinity;
        for (const shape of [0, 0.25, 0.5, 0.75, 1]) {
            const { arc, radius } = calcScanBeamGeometry(beamArea, shape);
            expect(radius).to.be.greaterThan(prevRadius);
            expect(arc).to.be.lessThan(prevArc);
            prevRadius = radius;
            prevArc = arc;
        }
    });

    it('returns no beam when beamArea is 0 (no beam design fitted)', () => {
        const { arc, radius } = calcScanBeamGeometry(0, 0.5);
        expect(arc).to.equal(0);
        expect(radius).to.equal(0);
    });
});
