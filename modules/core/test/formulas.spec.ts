import {
    EPSILON,
    RTuple2,
    archIntersection,
    equasionOfMotion,
    lerp,
    limitPercision,
    timeToReachDistanceByAcceleration,
    toDegreesDelta,
    whenWillItStop,
} from '../src';
import {
    differentSignTuple2,
    float,
    floatIn,
    orderedDegreesTuple4,
    orderedTuple2,
    orderedTuple3,
    safeFloat,
} from './properties';

import { expect } from 'chai';
import fc from 'fast-check';

describe('formulas', () => {
    describe('toDegreesDelta', () => {
        it('-180 becomes 180', () => {
            expect(toDegreesDelta(-180)).to.eql(180);
        });
        it('between (-180, 180]', () => {
            fc.assert(
                fc.property(floatIn(1000), (number: number) => {
                    expect(toDegreesDelta(number)).to.be.within(-180, 180);
                    expect(toDegreesDelta(number), 'dont return -180').to.not.eql(-180);
                }),
            );
        });
        it('same direction', () => {
            fc.assert(
                fc.property(floatIn(1000), (deg: number) => {
                    const result = limitPercision(toDegreesDelta(deg));
                    const mod360 = limitPercision(((deg % 360) + 360) % 360);
                    const minus360mod360 = limitPercision((mod360 - 360) % 360);
                    expect(result).to.be.oneOf([mod360, minus360mod360]);
                }),
            );
        });
    });
    describe('archIntersection', () => {
        function getArcsCase(a0: number, a1: number, b0: number, b1: number): [RTuple2, RTuple2] {
            return [[a0, a1] as RTuple2, [b0, b1] as RTuple2];
        }
        function expectArcToBe(actual: RTuple2 | null, expected: RTuple2 | null, message: string) {
            if (expected) {
                expect(actual && toDegreesDelta(actual[0]), message).to.be.closeTo(
                    toDegreesDelta(expected[0]),
                    EPSILON * 2,
                );
                expect(actual && toDegreesDelta(actual[1]), message).to.be.closeTo(
                    toDegreesDelta(expected[1]),
                    EPSILON * 2,
                );
            } else {
                expect(actual, message).to.eql(null);
            }
        }
        it('on A before B', () => {
            fc.assert(
                fc.property(
                    orderedDegreesTuple4().map(([a0, a1, b0, b1]) => getArcsCase(a0, a1, b0, b1)),
                    ([arcA, arcB]) => {
                        expectArcToBe(archIntersection(arcA, arcB), null, 'archIntersection()');
                        expectArcToBe(archIntersection(arcB, arcA), null, 'archIntersection() reverse');
                    },
                ),
            );
        });
        it('on A in B', () => {
            fc.assert(
                fc.property(
                    orderedDegreesTuple4().map(([b0, a0, a1, b1]) => getArcsCase(a0, a1, b0, b1)),
                    ([arcA, arcB]) => {
                        expectArcToBe(archIntersection(arcA, arcB), arcA, 'archIntersection()');
                        expectArcToBe(archIntersection(arcB, arcA), arcA, 'archIntersection() reverse');
                    },
                ),
            );
        });
        it('on interwined: B starts in A, and A ends in B', () => {
            fc.assert(
                fc.property(
                    orderedDegreesTuple4().map(([a0, b0, a1, b1]) => getArcsCase(a0, a1, b0, b1)),
                    ([arcA, arcB]) => {
                        expectArcToBe(archIntersection(arcA, arcB), [arcB[0], arcA[1]], 'archIntersection()');
                        expectArcToBe(archIntersection(arcB, arcA), [arcB[0], arcA[1]], 'archIntersection() reverse');
                    },
                ),
            );
        });
        it('regression (B in A)', () => {
            const arcA = [90, -90.01] as RTuple2;
            const arcB = [96.91, 97.3] as RTuple2;
            expectArcToBe(archIntersection(arcA, arcB), arcB, 'archIntersection()');
        });
    });
    describe('lerp', () => {
        const lerpProperty = (
            predicate: (fromRange: [number, number], toRange: [number, number], fromValue: number) => boolean | void,
        ) =>
            fc.property(orderedTuple3(), orderedTuple2(), (from: [number, number, number], to: [number, number]) => {
                predicate([from[0], from[2]], to, from[1]);
            });
        it('witin range', () => {
            fc.assert(
                lerpProperty((fromRange: [number, number], toRange: [number, number], fromValue: number) => {
                    expect(lerp(fromRange, toRange, fromValue)).to.be.within(...toRange);
                }),
            );
        });
        it('symettric and reversible', () => {
            fc.assert(
                lerpProperty((fromRange: [number, number], toRange: [number, number], fromValue: number) => {
                    const toValue = lerp(fromRange, toRange, fromValue);
                    const grace = (fromRange[1] - fromRange[0]) * (toRange[1] - toRange[0]) * 0.0001;
                    expect(lerp(toRange, fromRange, toValue)).to.be.closeTo(fromValue, Math.abs(grace));
                }),
            );
        });
    });
    it('equasionOfMotion', () => {
        const SLICES = 10000;
        fc.assert(
            fc.property(
                safeFloat(),
                safeFloat(),
                safeFloat(),
                safeFloat(),
                (x0: number, v0: number, a: number, t: number) => {
                    let x = x0;
                    let v = v0;
                    const timeSlice = t / SLICES;
                    for (let i = 0; i < SLICES; i++) {
                        x += v * timeSlice;
                        v += a * timeSlice;
                    }
                    expect(equasionOfMotion(x0, v0, a, t)).to.be.closeTo(x, Math.abs(x / Math.sqrt(SLICES)));
                },
            ),
        );
    });
    it('timeToReachDistanceByAcceleration', () => {
        fc.assert(
            fc.property(
                float(EPSILON, Math.pow(2, 30)),
                float(EPSILON, Math.pow(2, 30)),
                (distance: number, acceleration: number) => {
                    const totalTime = timeToReachDistanceByAcceleration(distance, acceleration);
                    const halfTime = totalTime / 2;
                    const distanceSpeedingUp = equasionOfMotion(0, 0, acceleration, halfTime);
                    expect(distanceSpeedingUp).to.be.closeTo(distance / 2, EPSILON);
                    const distanceSpeedingDown = equasionOfMotion(
                        0,
                        (acceleration * totalTime) / 2,
                        -acceleration,
                        halfTime,
                    );
                    expect(distanceSpeedingDown).to.be.closeTo(distance / 2, EPSILON);
                },
            ),
        );
    });
    describe('whenWillItStop', () => {
        it('detects stop correctly', () => {
            const ITERATIONS = 10000;
            fc.assert(
                fc.property(
                    differentSignTuple2().filter((t) => t[0] !== 0 && t[1] !== 0),
                    ([v0, a]: [number, number]) => {
                        const timeToStop = whenWillItStop(v0, a);
                        const iterationTime = timeToStop / ITERATIONS;
                        let v = v0;
                        for (let i = 0; i < ITERATIONS; i++) {
                            v += a * iterationTime;
                        }
                        expect(v).to.be.closeTo(0, 1 / Math.sqrt(ITERATIONS));
                    },
                ),
            );
        });
        it('detects no-stop correctly', () => {
            fc.assert(
                fc.property(
                    differentSignTuple2().filter((t) => t[0] !== 0 && t[1] !== 0),
                    ([v0, a]: [number, number]) => {
                        expect(whenWillItStop(v0, -a)).to.eql(Infinity);
                    },
                ),
            );
        });
    });
});
