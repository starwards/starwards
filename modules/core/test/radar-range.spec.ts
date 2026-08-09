import { Radar, degToRad, getRange, malfunctionAreaFactor, radarRangeFromArea } from '../src';

import { HackLevel } from '../src';
import { JsonPointer } from '../src/json-ptr';
import { expect } from 'chai';
import fc from 'fast-check';

/**
 * U1 — radar range / area computation.
 *
 * Supersedes the geometry tests in radar.spec.ts. The project's chosen area
 * normalization is `area = range^2 * arc * degToRad` (NOT the geometric
 * 1/2 * theta * r^2), where `degToRad = Math.PI / 180`. `radarRangeFromArea`
 * inverts it: `range = sqrt(effectiveArea / (arc * degToRad))`.
 */
describe('radarRangeFromArea', () => {
    it('inverts the area invariant: range^2 * arc * degToRad ≈ effectiveArea (fast-check)', () =>
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 1e9, noNaN: true }),
                fc.double({ min: 1, max: 360, noNaN: true }),
                (effectiveArea, arc) => {
                    const range = radarRangeFromArea(effectiveArea, arc);
                    const tolerance = effectiveArea * 1e-6 + 1e-9;
                    expect(range * range * arc * degToRad).to.be.closeTo(effectiveArea, tolerance);
                },
            ),
        ));

    it('returns 0 when arc <= 0', () => {
        expect(radarRangeFromArea(1_000_000, 0)).to.equal(0);
        expect(radarRangeFromArea(1_000_000, -30)).to.equal(0);
    });

    it('returns 0 when effectiveArea <= 0', () => {
        expect(radarRangeFromArea(0, 45)).to.equal(0);
        expect(radarRangeFromArea(-5, 45)).to.equal(0);
    });

    it('monotonic in arc: fixed area, larger arc yields smaller range (fast-check)', () =>
        fc.assert(
            fc.property(
                fc.double({ min: 1, max: 1e9, noNaN: true }),
                fc.double({ min: 1, max: 179, noNaN: true }),
                fc.double({ min: 180, max: 360, noNaN: true }),
                (area, smallArc, bigArc) => {
                    expect(radarRangeFromArea(area, bigArc)).to.be.lessThan(radarRangeFromArea(area, smallArc));
                },
            ),
        ));

    it('monotonic in area: fixed arc, larger area yields larger range (fast-check)', () =>
        fc.assert(
            fc.property(
                fc.double({ min: 1, max: 360, noNaN: true }),
                fc.double({ min: 1, max: 5e8, noNaN: true }),
                fc.double({ min: 5e8 + 1, max: 1e9, noNaN: true }),
                (arc, smallArea, bigArea) => {
                    expect(radarRangeFromArea(bigArea, arc)).to.be.greaterThan(radarRangeFromArea(smallArea, arc));
                },
            ),
        ));
});

describe('Radar geometry', () => {
    const beamDesign = { range: 20_000, minArc: 5, maxArc: 90, defaultArc: 20 };

    function makeBeamRadar() {
        const radar = new Radar();
        radar.design.assign(beamDesign);
        return radar;
    }

    it('arc initializes to design.defaultArc', () => {
        const radar = makeBeamRadar();
        expect(radar.arc).to.equal(radar.design.defaultArc);
    });

    it('arc @range is bounded by [minArc, maxArc]', () => {
        const radar = makeBeamRadar();
        const [min, max] = getRange(radar, JsonPointer.create('/arc'));
        expect(min).to.equal(radar.design.minArc);
        expect(max).to.equal(radar.design.maxArc);
    });

    it('range getter reflects the area invariant at full effectiveness', () => {
        const radar = makeBeamRadar();
        radar.power = 1;
        radar.hacked = HackLevel.OK;
        radar.malfunctionRangeFactor = 0;
        expect(radar.range * radar.range * radar.arc * degToRad).to.be.closeTo(
            radar.design.area,
            radar.design.area * 1e-3,
        );
    });

    it('range shrinks as arc widens at constant area (constant effective area)', () => {
        const wide = makeBeamRadar();
        const narrow = makeBeamRadar();
        wide.power = 1;
        narrow.power = 1;
        wide.arc = 80;
        narrow.arc = 10;
        expect(wide.range).to.be.lessThan(narrow.range);
    });
});

describe('Radar effectiveness scaling', () => {
    const beamDesign = { range: 20_000, minArc: 5, maxArc: 90, defaultArc: 20 };

    function makeBeamRadar() {
        const radar = new Radar();
        radar.design.assign(beamDesign);
        radar.malfunctionRangeFactor = 0;
        return radar;
    }

    it('power = 0 yields range 0', () => {
        const radar = makeBeamRadar();
        radar.power = 0;
        expect(radar.range).to.equal(0);
    });

    it('range scales with sqrt(effectiveness): power 1 vs 0.25 → range ratio ≈ 2', () => {
        const full = makeBeamRadar();
        const quarter = makeBeamRadar();
        full.power = 1;
        quarter.power = 0.25;
        expect(full.range / quarter.range).to.be.closeTo(2, 1e-3);
    });
});

describe('Radar damage never blacks out the radar', () => {
    // per-issue design: damage must degrade range smoothly toward a floor, never cut it to 0 outright.
    const damagedBeamDesign = {
        range: 20_000,
        minArc: 5,
        maxArc: 90,
        defaultArc: 20,
        rangeEaseFactor: 0.2,
        malfunctionRange: 2_000,
    };

    function makeDamagedBeamRadar() {
        const radar = new Radar();
        radar.design.assign(damagedBeamDesign);
        radar.power = 1;
        return radar;
    }

    it('a radar broken by accumulated malfunction damage still holds its floor range, not 0', () => {
        const radar = makeDamagedBeamRadar();
        radar.malfunctionRangeFactor = 5; // far past the broken threshold
        expect(radar.broken).to.equal(true); // still counts toward the kill-ratio / DISABLED status
        expect(radar.range).to.be.closeTo(radar.design.malfunctionRange, 1); // but never blacks out
    });

    it('range never drops to 0 from malfunction damage alone, however severe (fast-check)', () =>
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 20, noNaN: true }),
                fc.double({ min: 0, max: 1, noNaN: true }),
                (malfunctionRangeFactor, waveSample) => {
                    const radar = makeDamagedBeamRadar();
                    radar.malfunctionRangeFactor = malfunctionRangeFactor;
                    radar.areaFactor = malfunctionAreaFactor(
                        malfunctionRangeFactor,
                        radar.design.rangeEaseFactor,
                        waveSample,
                    );
                    expect(radar.range).to.be.greaterThan(0);
                },
            ),
        ));

    it('under even the worst malfunction sample, a close-range (2-4km) contact stays within reach', () => {
        const radar = makeDamagedBeamRadar();
        radar.malfunctionRangeFactor = 5; // severe accumulated damage
        radar.areaFactor = 0; // worst-case wave sample: fully at the malfunction floor
        expect(radar.range).to.be.closeTo(radar.design.malfunctionRange, 1);
    });
});

describe('malfunctionAreaFactor', () => {
    it('healthy radar (malfunctionRangeFactor = 0) returns 1', () => {
        for (const waveSample of [0, 0.25, 0.5, 0.75, 1]) {
            expect(malfunctionAreaFactor(0, 0.1, waveSample)).to.equal(1);
        }
    });

    it('damaged radar stays within [floor, 1] across wave samples (fast-check)', () =>
        fc.assert(
            fc.property(
                fc.double({ min: Math.fround(0.01), max: Math.fround(0.9), noNaN: true }),
                fc.double({ min: 0, max: Math.fround(0.4), noNaN: true }),
                fc.double({ min: 0, max: 1, noNaN: true }),
                (malfunctionRangeFactor, rangeEaseFactor, waveSample) => {
                    const factor = malfunctionAreaFactor(malfunctionRangeFactor, rangeEaseFactor, waveSample);
                    expect(factor).to.be.at.most(1);
                    expect(factor).to.be.at.least(0);
                },
            ),
        ));
});
