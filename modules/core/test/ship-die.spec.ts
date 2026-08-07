import { ShipDie } from '../src/ship/ship-die';
import { expect } from 'chai';

const EVENT_SALT_WINDOW_SECONDS = 3;

function tick(die: ShipDie, deltaSeconds: number) {
    die.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: 0 });
}

describe('ShipDie', () => {
    describe('event rolls', () => {
        it('same seed + same id ⇒ identical getRoll', () => {
            const a = new ShipDie(42);
            const b = new ShipDie(42);
            expect(a.getRoll('event:123')).to.equal(b.getRoll('event:123'));
            expect(a.getRoll('event:456')).to.equal(b.getRoll('event:456'));
        });

        it('different ids ⇒ different rolls (spot check)', () => {
            const die = new ShipDie(1);
            const samples = new Set<number>();
            for (let i = 0; i < 16; i++) samples.add(die.getRoll(`event:${i}`));
            expect(samples.size).to.be.greaterThan(12);
        });

        it('same id, no update() between rolls ⇒ identical value (within-window stability)', () => {
            const die = new ShipDie(7);
            const first = die.getRoll('damageSystem:abc');
            expect(die.getRoll('damageSystem:abc')).to.equal(first);
            expect(die.getRoll('damageSystem:abc')).to.equal(first);
        });

        it('rolls are stable across update() calls that stay within one salt window', () => {
            const die = new ShipDie(7);
            const first = die.getRoll('damageSystem:abc');
            for (let i = 0; i < 10; i++) {
                tick(die, 0.1); // 10 x 0.1s = 1s, well within the 3s window
                expect(die.getRoll('damageSystem:abc')).to.equal(first);
            }
        });

        it('same id, sampled across several salt windows ⇒ decorrelates (at least two distinct values)', () => {
            const die = new ShipDie(7);
            const values = new Set<number>();
            values.add(die.getRoll('damageSystem:abc'));
            for (let w = 0; w < 5; w++) {
                tick(die, EVENT_SALT_WINDOW_SECONDS + 0.001);
                values.add(die.getRoll('damageSystem:abc'));
            }
            expect(values.size).to.be.greaterThan(1);
        });

        it('replay determinism: two dice, same seed, same update sequence ⇒ identical roll sequences', () => {
            const a = new ShipDie(55);
            const b = new ShipDie(55);
            const stepsSeconds = [0.1, 0.2, 3.05, 0.1, 6.2, 1, 0.1];
            for (const dt of stepsSeconds) {
                tick(a, dt);
                tick(b, dt);
                expect(a.getRoll('id-1')).to.equal(b.getRoll('id-1'));
                expect(a.getSuccess('id-2', 0.4)).to.equal(b.getSuccess('id-2', 0.4));
                expect(a.getRollInRange('id-3', -5, 5)).to.equal(b.getRollInRange('id-3', -5, 5));
            }
        });

        it('getRollInRange maps into the requested range', () => {
            const die = new ShipDie(99);
            for (let i = 0; i < 100; i++) {
                const v = die.getRollInRange(`k:${i}`, -5, 5);
                expect(v).to.be.at.least(-5);
                expect(v).to.be.lessThan(5);
            }
        });

        it('different seeds ⇒ different rolls for the same id', () => {
            const diffs = new Set<number>();
            for (let s = 0; s < 8; s++) {
                diffs.add(new ShipDie(s).getRoll('same-id'));
            }
            expect(diffs.size).to.be.greaterThan(6);
        });

        it('getSuccess honours the probability (statistically)', () => {
            const die = new ShipDie(123);
            let hits = 0;
            for (let i = 0; i < 2000; i++) {
                if (die.getSuccess(`p:${i}`, 0.3)) hits++;
            }
            // Expected ~600; allow generous slack.
            expect(hits).to.be.within(450, 750);
        });

        it('getSuccess on one fixed id, sampled once per window across many windows, approaches the given probability (eternal-freeze regression)', () => {
            const die = new ShipDie(321);
            let hits = 0;
            const windows = 200;
            for (let w = 0; w < windows; w++) {
                if (die.getSuccess('lingering-phenomenon', 0.3)) hits++;
                tick(die, EVENT_SALT_WINDOW_SECONDS + 0.001);
            }
            expect(hits / windows).to.be.within(0.2, 0.4);
        });
    });

    describe('drift rolls', () => {
        it('getDrift is continuous in game time', () => {
            const die = new ShipDie(42);
            let prev = die.getDrift('smartPilotOffset', 0.3);
            let maxDelta = 0;
            for (let i = 0; i < 120; i++) {
                tick(die, 1 / 60);
                const v = die.getDrift('smartPilotOffset', 0.3);
                maxDelta = Math.max(maxDelta, Math.abs(v - prev));
                prev = v;
            }
            // 60 Hz sampling at 0.3 Hz drift: step should be small.
            expect(maxDelta).to.be.lessThan(0.05);
        });

        it('getDrift spans roughly [0,1) over a long window', () => {
            const die = new ShipDie(42);
            let lo = 1;
            let hi = 0;
            for (let i = 0; i < 600; i++) {
                tick(die, 0.1);
                const v = die.getDrift('radar', 0.5);
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
            expect(lo).to.be.lessThan(0.2);
            expect(hi).to.be.greaterThan(0.8);
        });

        it('two drift channels are not phase-locked', () => {
            const die = new ShipDie(42);
            let sumAbsDiff = 0;
            for (let i = 0; i < 200; i++) {
                tick(die, 1 / 30);
                sumAbsDiff += Math.abs(die.getDrift('a', 0.3) - die.getDrift('b', 0.3));
            }
            // If channels were identical, this sum would be 0.
            expect(sumAbsDiff).to.be.greaterThan(10);
        });

        it('getDriftInRange maps into the requested range', () => {
            const die = new ShipDie(42);
            for (let i = 0; i < 300; i++) {
                tick(die, 1 / 60);
                const v = die.getDriftInRange('smartPilotOffset', -180, 180, 0.3);
                expect(v).to.be.at.least(-180);
                expect(v).to.be.lessThan(180);
            }
        });

        it('is unaffected by salt window rotation: equal gameTime ⇒ equal drift regardless of rotations crossed', () => {
            // Reach the same absolute gameTime via two different paths: one that crosses
            // several salt-window boundaries, one that lands there in a single step.
            const targetSeconds = EVENT_SALT_WINDOW_SECONDS * 4 + 1.2345;

            const stepped = new ShipDie(17);
            for (let i = 0; i < 400; i++) tick(stepped, targetSeconds / 400);

            const jumped = new ShipDie(17);
            tick(jumped, targetSeconds);

            expect(jumped.getDrift('radar', 0.5)).to.be.closeTo(stepped.getDrift('radar', 0.5), 1e-6);
        });

        it('shows no discontinuity in getDrift when a salt window boundary is crossed', () => {
            const die = new ShipDie(8);
            // Land just before a boundary.
            tick(die, EVENT_SALT_WINDOW_SECONDS - 0.01);
            const before = die.getDrift('radar', 0.2);
            tick(die, 0.02); // crosses the boundary
            const across = die.getDrift('radar', 0.2);
            tick(die, 0.02); // same step size, away from the boundary
            const after = die.getDrift('radar', 0.2);

            const stepAtBoundary = Math.abs(across - before);
            const stepAwayFromBoundary = Math.abs(after - across);
            // The boundary-crossing step should be of the same order as a normal step,
            // not a jump caused by the salt rotating.
            expect(stepAtBoundary).to.be.lessThan(stepAwayFromBoundary + 0.05);
        });
    });

    describe('getGaussian', () => {
        it('same seed + same id ⇒ identical value', () => {
            const a = new ShipDie(42);
            const b = new ShipDie(42);
            expect(a.getGaussian('aim:shell-1', 10, 2)).to.equal(b.getGaussian('aim:shell-1', 10, 2));
        });

        it('different ids ⇒ different values (spot check)', () => {
            const die = new ShipDie(1);
            const samples = new Set<number>();
            for (let i = 0; i < 16; i++) samples.add(die.getGaussian(`aim:${i}`, 0, 1));
            expect(samples.size).to.be.greaterThan(12);
        });

        it('different seeds ⇒ different values for the same id', () => {
            const diffs = new Set<number>();
            for (let s = 0; s < 8; s++) {
                diffs.add(new ShipDie(s).getGaussian('same-id', 0, 1));
            }
            expect(diffs.size).to.be.greaterThan(6);
        });

        it('is centered on mean and bounded by the Irwin-Hall approximation (statistically)', () => {
            const die = new ShipDie(123);
            let sum = 0;
            const stdev = 2;
            const mean = 5;
            const n = 2000;
            for (let i = 0; i < n; i++) {
                const v = die.getGaussian(`g:${i}`, mean, stdev);
                expect(v).to.be.at.least(mean - 3 * stdev);
                expect(v).to.be.at.most(mean + 3 * stdev);
                sum += v;
            }
            expect(sum / n).to.be.closeTo(mean, 0.2);
        });
    });
});
