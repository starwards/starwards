import { expect } from 'chai';
import fc from 'fast-check';
import 'mocha';
import { equasionOfMotion, lerp, limitPercision, toDegreesDelta, whenWillItStop } from '../src';
import { differentSignTuple2, floatIn, orderedTuple2, orderedTuple3, safeFloat } from './properties';

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
                })
            );
        });
        it('same direction', () => {
            fc.assert(
                fc.property(floatIn(1000), (deg: number) => {
                    const result = limitPercision(toDegreesDelta(deg));
                    const mod360 = limitPercision(((deg % 360) + 360) % 360);
                    const minus360mod360 = limitPercision((mod360 - 360) % 360);
                    expect(result).to.be.oneOf([mod360, minus360mod360]);
                })
            );
        });
    });

    describe('lerp', () => {
        const lerpProperty = (
            predicate: (fromRange: [number, number], toRange: [number, number], fromValue: number) => boolean | void
        ) =>
            fc.property(orderedTuple3(), orderedTuple2(), (from: [number, number, number], to: [number, number]) => {
                predicate([from[0], from[2]], to, from[1]);
            });
        it('witin range', () => {
            fc.assert(
                lerpProperty((fromRange: [number, number], toRange: [number, number], fromValue: number) => {
                    expect(lerp(fromRange, toRange, fromValue)).to.be.within(...toRange);
                })
            );
        });
        it('symettric and reversible', () => {
            fc.assert(
                lerpProperty((fromRange: [number, number], toRange: [number, number], fromValue: number) => {
                    const toValue = lerp(fromRange, toRange, fromValue);
                    const grace = (fromRange[1] - fromRange[0]) * (toRange[1] - toRange[0]) * 0.0001;
                    expect(lerp(toRange, fromRange, toValue)).to.be.closeTo(fromValue, Math.abs(grace));
                })
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
                }
            )
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
                    }
                )
            );
        });
        it('detects no-stop correctly', () => {
            fc.assert(
                fc.property(
                    differentSignTuple2().filter((t) => t[0] !== 0 && t[1] !== 0),
                    ([v0, a]: [number, number]) => {
                        expect(whenWillItStop(v0, -a)).to.eql(Infinity);
                    }
                )
            );
        });
    });
});
