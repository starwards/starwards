import {
    RADAR_MALFUNCTION_MAX_DRIFT_HZ,
    RADAR_MALFUNCTION_MIN_DRIFT_HZ,
    RADAR_MALFUNCTION_RATE_CONSTANT_HZ,
    Radar,
    ShipDie,
    degToRad,
    getRange,
    malfunctionAreaFactor,
    malfunctionNoiseFrequencyHz,
    malfunctionSeverity,
    radarRangeFromArea,
    sampleRadarAreaFactor,
    shipConfigurations,
} from '../src';

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

    it('a skew-jammed radar (aimed past its physical limit) reads range 0, not the malfunction floor', () => {
        // maxBearingSkew: 45 gives this beam a skew surface at all — an omni radar (maxBearingSkew
        // 0) can never be skew-jammed, per the unified-defectibles rule in turret.spec.ts.
        const radar = new Radar();
        radar.design.assign({ ...beamDesign, maxBearingSkew: 45, turnSpeed: 30 });
        radar.power = 1;
        radar.malfunctionRangeFactor = 0; // undamaged: only the skew jam is in play
        radar.bearingSkew = 45; // pinned at the design's physical limit
        expect(radar.broken).to.equal(true);
        expect(radar.range).to.equal(0); // stuck pointed away from where it's commanded — sees nothing
    });
});

describe('Radar damage never blacks out the radar', () => {
    // per-issue design: damage must degrade range smoothly toward a floor, never cut it to 0 outright,
    // and the areaFactor blend (not a `broken` short-circuit) always governs range.
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
        radar.areaFactor = malfunctionAreaFactor(radar.malfunctionRangeFactor, radar.design.rangeEaseFactor, 0.5);
        expect(radar.range).to.be.closeTo(radar.design.malfunctionRange, 1); // but never blacks out
    });

    it('range never drops to 0 from malfunction damage alone, however severe (fast-check)', () =>
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 20, noNaN: true }),
                fc.double({ min: 0, max: 1, noNaN: true }),
                (malfunctionRangeFactor, noiseSample) => {
                    const radar = makeDamagedBeamRadar();
                    radar.malfunctionRangeFactor = malfunctionRangeFactor;
                    radar.areaFactor = malfunctionAreaFactor(
                        malfunctionRangeFactor,
                        radar.design.rangeEaseFactor,
                        noiseSample,
                    );
                    expect(radar.range).to.be.greaterThan(0);
                },
            ),
        ));

    it('under even the worst malfunction sample, a close-range (2-4km) contact stays within reach', () => {
        const radar = makeDamagedBeamRadar();
        radar.malfunctionRangeFactor = 5; // severe accumulated damage
        radar.areaFactor = 0; // worst-case blend weight: fully at the malfunction floor
        expect(radar.range).to.be.closeTo(radar.design.malfunctionRange, 1);
    });

    it('a lightly damaged radar never dips toward the floor, at any noise sample (fast-check)', () =>
        fc.assert(
            fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (noiseSample) => {
                const radar = makeDamagedBeamRadar();
                radar.malfunctionRangeFactor = 0.05; // one hit's worth of damage
                radar.areaFactor = malfunctionAreaFactor(
                    radar.malfunctionRangeFactor,
                    radar.design.rangeEaseFactor,
                    noiseSample,
                );
                // full range is 20km, floor is 2km — light damage must stay close to full, nowhere near the floor
                expect(radar.range).to.be.greaterThan(15_000);
            }),
        ));

    it('range decreases monotonically with damage, at a fixed-but-arbitrary noise sample, across every shipped radar design and several arc settings (fast-check)', () =>
        fc.assert(
            fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (noiseSample) => {
                // the noise sample is fixed *within* one damage sweep (isolating the damage trend)
                // but fast-check varies it across runs, so the property holds for the actual signal
                // — not only at the one sample (0.5) that happens to zero the noise offset.
                const damageLevels = [0, 0.1, 0.3, 0.5, 0.8, 1, 2];
                const arcs = [10, 45, 90, 180, 360];
                for (const [modelName, config] of Object.entries(shipConfigurations)) {
                    for (const radarDesign of config.radars) {
                        for (const arc of arcs) {
                            const radar = new Radar();
                            radar.design.assign(radarDesign);
                            radar.power = 1;
                            if (radar.design.minArc > arc || radar.design.maxArc < arc) {
                                continue; // arc setting not valid for this radar's design envelope
                            }
                            radar.arc = arc;
                            let previousRange = Infinity;
                            for (const damage of damageLevels) {
                                radar.malfunctionRangeFactor = damage;
                                radar.areaFactor = malfunctionAreaFactor(
                                    damage,
                                    radar.design.rangeEaseFactor,
                                    noiseSample,
                                );
                                expect(
                                    radar.range,
                                    `${modelName}/arc=${arc}/noise=${noiseSample}: range must not increase from damage ${damage}`,
                                ).to.be.at.most(previousRange + 1e-6);
                                previousRange = radar.range;
                            }
                        }
                    }
                }
            }),
            { numRuns: 20 }, // the inner sweep is already large (configs x radars x arcs x damage); a few dozen noise samples is enough
        ));
});

describe('malfunctionAreaFactor', () => {
    it('healthy radar (malfunctionRangeFactor = 0) returns 1', () => {
        for (const noiseSample of [0, 0.25, 0.5, 0.75, 1]) {
            expect(malfunctionAreaFactor(0, 0.1, noiseSample)).to.equal(1);
        }
    });

    it('fully malfunctioning radar (malfunctionRangeFactor >= 1) pins at the floor (0), regardless of noise (fast-check)', () =>
        fc.assert(
            fc.property(
                fc.double({ min: 1, max: 20, noNaN: true }),
                fc.double({ min: 0, max: Math.fround(0.4), noNaN: true }),
                fc.double({ min: 0, max: 1, noNaN: true }),
                (malfunctionRangeFactor, rangeEaseFactor, noiseSample) => {
                    expect(malfunctionAreaFactor(malfunctionRangeFactor, rangeEaseFactor, noiseSample)).to.equal(0);
                },
            ),
        ));

    it('damaged radar stays within [floor, 1] across noise samples (fast-check)', () =>
        fc.assert(
            fc.property(
                fc.double({ min: Math.fround(0.01), max: Math.fround(0.9), noNaN: true }),
                fc.double({ min: 0, max: Math.fround(0.4), noNaN: true }),
                fc.double({ min: 0, max: 1, noNaN: true }),
                (malfunctionRangeFactor, rangeEaseFactor, noiseSample) => {
                    const factor = malfunctionAreaFactor(malfunctionRangeFactor, rangeEaseFactor, noiseSample);
                    expect(factor).to.be.at.most(1);
                    expect(factor).to.be.at.least(0);
                },
            ),
        ));

    it('amplitude tapers to 0 (no fluctuation) at both damage extremes, and is widest around mid-damage (fast-check)', () =>
        fc.assert(
            fc.property(fc.double({ min: 0.01, max: 0.4, noNaN: true }), (rangeEaseFactor) => {
                const spread = (d: number) =>
                    malfunctionAreaFactor(d, rangeEaseFactor, 1) - malfunctionAreaFactor(d, rangeEaseFactor, 0);
                // near-zero damage: negligible spread. Mid damage (0.5): the widest possible spread.
                expect(spread(0.01)).to.be.lessThan(spread(0.5));
                expect(spread(0.99)).to.be.lessThan(spread(0.5));
            }),
        ));
});

describe('malfunctionNoiseFrequencyHz (amplitude x frequency invariant)', () => {
    it('frequency is inversely proportional to severity, within its unclamped band', () => {
        // light, moderate, heavy — all inside [RATE/MAX_HZ, RATE/MIN_HZ] so the clamp never engages
        expect(malfunctionNoiseFrequencyHz(0.1)).to.be.closeTo(1.0, 1e-6); // severity 0.1
        expect(malfunctionNoiseFrequencyHz(0.3)).to.be.closeTo(0.333, 1e-3); // severity 0.3
        expect(malfunctionNoiseFrequencyHz(0.5)).to.be.closeTo(0.2, 1e-6); // severity 0.5 (peak)
        // light damage jitters faster than heavy damage, as the design table specifies
        expect(malfunctionNoiseFrequencyHz(0.1)).to.be.greaterThan(malfunctionNoiseFrequencyHz(0.5));
    });

    it('stays within its declared band regardless of how extreme the damage input is (fast-check)', () =>
        fc.assert(
            fc.property(fc.double({ min: 0, max: 50, noNaN: true }), (malfunctionRangeFactor) => {
                const frequency = malfunctionNoiseFrequencyHz(malfunctionRangeFactor);
                expect(frequency).to.be.at.least(RADAR_MALFUNCTION_MIN_DRIFT_HZ);
                expect(frequency).to.be.at.most(RADAR_MALFUNCTION_MAX_DRIFT_HZ);
            }),
        ));

    it('amplitude × frequency is constant across representative light/medium/heavy damage levels, by construction', () => {
        // rangeEaseFactor is a per-design knob (0.2 on every shipped radar); amplitude here mirrors
        // malfunctionAreaFactor's own `rangeEaseFactor * malfunctionSeverity`.
        const rangeEaseFactor = 0.2;
        const expectedProduct = rangeEaseFactor * RADAR_MALFUNCTION_RATE_CONSTANT_HZ;
        for (const damage of [0.1, 0.3, 0.5]) {
            // light, medium, heavy — chosen inside the unclamped band so the invariant holds exactly
            const amplitude = rangeEaseFactor * malfunctionSeverity(damage);
            const frequency = malfunctionNoiseFrequencyHz(damage);
            expect(amplitude * frequency, `damage=${damage}`).to.be.closeTo(expectedProduct, 1e-9);
        }
    });

    it('measured against a real Die: max |d(range)/dt| stays within the same order of magnitude at light/medium/heavy damage', () => {
        // Unlike the closed-form product above, this drives the actual noise pipeline
        // (sampleRadarAreaFactor over a real ShipDie, ticking through simulated time) and reads
        // range off a real Radar — so a regression in either curve (or their coupling) that the
        // closed-form check can't see would show up here as a lopsided ratio.
        const design = {
            range: 20_000,
            minArc: 5,
            maxArc: 90,
            defaultArc: 20,
            rangeEaseFactor: 0.2,
            malfunctionRange: 2_000,
        };
        const dt = 0.05;
        const durationSeconds = 20;

        function maxRateOfChange(damage: number) {
            const die = new ShipDie(42);
            const radar = new Radar();
            radar.design.assign(design);
            radar.power = 1;
            radar.malfunctionRangeFactor = damage;
            let previousRange: number | null = null;
            let maxRate = 0;
            for (let t = 0; t <= durationSeconds; t += dt) {
                die.update({ deltaSeconds: dt, deltaSecondsAvg: dt, totalSeconds: t });
                radar.areaFactor = sampleRadarAreaFactor(die, 'trace:0', damage, design.rangeEaseFactor);
                const range = radar.range;
                if (previousRange !== null) {
                    maxRate = Math.max(maxRate, Math.abs(range - previousRange) / dt);
                }
                previousRange = range;
            }
            return maxRate;
        }

        const light = maxRateOfChange(0.1);
        const medium = maxRateOfChange(0.3);
        const heavy = maxRateOfChange(0.5);
        const spread = Math.max(light, medium, heavy) / Math.min(light, medium, heavy);
        // stated tolerance: a real sampled trace carries discretization/clamping noise the
        // closed-form product doesn't, so this is looser than exact — but a regression that
        // decouples amplitude from frequency would blow well past this, not just graze it.
        expect(
            spread,
            `light=${light.toFixed(0)} medium=${medium.toFixed(0)} heavy=${heavy.toFixed(0)} m/s`,
        ).to.be.at.most(3);
    });
});
