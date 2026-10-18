import {
    ChainGun,
    PowerLevel,
    Radar,
    SpaceManager,
    Spaceship,
    makeShipState,
    shipConfigurations,
    updateTurret,
} from '../src';

import { DamageManager } from '../src/ship/damage-manager';
import { MockDie } from './ship-test-harness';
import { applySkewDefect } from '../src/ship/turret';
import { expect } from 'chai';
import { repairProtocols } from '../src/configurations/repair-protocols';

/** Lands every hit on the skew branch; `negative` controls only the sign roll. */
class SignDie extends MockDie {
    negative = false;
    public override getSuccess(id: string, p: number): boolean {
        return id.includes('Sign') ? !this.negative : super.getSuccess(id, p);
    }
}

/** A scan-beam-like mount: free traverse (±180), 30°/s, ±45° skew surface. */
function makeBeam(): Radar {
    const radar = new Radar();
    radar.design.assign({ turnSpeed: 30, bearingLimit: 180, maxBearingSkew: 45 });
    radar.power = PowerLevel.MAX;
    return radar;
}

describe('mount damage: one defectible that bends, narrows and jolts (M4.33)', () => {
    describe('traverse is derived from skew', () => {
        it('narrows linearly with |bearingSkew|', () => {
            const mount = makeBeam();
            mount.design.assign({ bearingLimit: 90 });
            expect(mount.bearingLimit).to.equal(90);
            mount.bearingSkew = 15;
            expect(mount.bearingLimit).to.be.closeTo(60, 0.001);
            mount.bearingSkew = -30;
            expect(mount.bearingLimit).to.be.closeTo(30, 0.001);
        });

        it('at max skew the mount is bolted at fitted bearing + skew', () => {
            const mount = makeBeam();
            mount.fittedBearing = 10;
            mount.bearingSkew = 45;
            mount.bearingCommand = 120;
            updateTurret(mount, 10);
            expect(mount.bearingLimit).to.equal(0);
            expect(mount.hullBearing).to.be.closeTo(55, 0.001);
            expect(mount.broken).to.equal(true);
        });

        it('a mount with no skew surface keeps its full design traverse', () => {
            const mount = makeBeam();
            mount.design.assign({ maxBearingSkew: 0, bearingLimit: 30 });
            expect(mount.bearingLimit).to.equal(30);
        });

        it('there is no separate traverse-limit defectible', () => {
            expect('bearingLimitFactor' in makeBeam()).to.equal(false);
        });
    });

    describe('applySkewDefect', () => {
        it('the first defect picks the sign; later defects only grow the magnitude', () => {
            const mount = makeBeam();
            applySkewDefect(mount, 2, -1);
            expect(mount.bearingSkew).to.be.closeTo(-2, 0.001);
            applySkewDefect(mount, 3, 1); // sign ignored once bent
            expect(mount.bearingSkew).to.be.closeTo(-5, 0.001);
        });

        it('caps at design.maxBearingSkew', () => {
            const mount = makeBeam();
            applySkewDefect(mount, 40, 1);
            applySkewDefect(mount, 40, 1);
            expect(mount.bearingSkew).to.equal(45);
        });

        it('does nothing on a mount with no skew surface', () => {
            const mount = makeBeam();
            mount.design.assign({ maxBearingSkew: 0 });
            applySkewDefect(mount, 5, 1);
            expect(mount.bearingSkew).to.equal(0);
        });

        it('jolts the bearing to the traverse edge toward the bend, keeping the command', () => {
            const mount = makeBeam();
            mount.design.assign({ bearingLimit: 90 });
            mount.bearingCommand = -20;
            updateTurret(mount, 10);
            expect(mount.bearing).to.be.closeTo(-20, 0.001);

            applySkewDefect(mount, 15, 1); // traverse now ±60, bend is positive

            expect(mount.bearing).to.be.closeTo(60, 0.001);
            expect(mount.bearingCommand).to.be.closeTo(-20, 0.001);
            // a re-aim delay, not a jam: it swings back at turnSpeed
            updateTurret(mount, 1);
            expect(mount.bearing).to.be.closeTo(30, 0.001);
            updateTurret(mount, 10);
            expect(mount.bearing).to.be.closeTo(-20, 0.001);
        });

        it('jolts toward a negative bend to the negative edge', () => {
            const mount = makeBeam();
            mount.design.assign({ bearingLimit: 90 });
            applySkewDefect(mount, 30, -1);
            expect(mount.bearing).to.be.closeTo(-30, 0.001);
        });

        it('no jolt when the skew is already at max (nothing grew)', () => {
            const mount = makeBeam();
            mount.bearingSkew = 45;
            mount.bearing = 0;
            applySkewDefect(mount, 2, 1);
            expect(mount.bearing).to.equal(0);
        });
    });

    describe('damage routes through the one defectible', () => {
        it('chain gun skew never shrinks under opposite-sign rolls', () => {
            const state = makeShipState('1', shipConfigurations['demo-ship']);
            const gun: ChainGun = state.chainGuns[0];
            gun.design.damage50 = 0;
            const die = new SignDie();
            const dm = new DamageManager(new Spaceship(), state, new SpaceManager(), die);
            die.negative = false;
            dm.damageSystem(gun, { id: 'a', amount: 1 }, 1);
            const first = gun.bearingSkew;
            expect(first).to.be.greaterThan(0);
            die.negative = true; // a later hit rolls the opposite sign
            dm.damageSystem(gun, { id: 'b', amount: 1 }, 1);
            expect(gun.bearingSkew).to.be.greaterThan(first);
        });

        it('radar damage narrows traverse only through skew', () => {
            const state = makeShipState('1', shipConfigurations['demo-ship']);
            const radar = state.radars[1];
            radar.design.damage50 = 0;
            const die = new MockDie();
            const dm = new DamageManager(new Spaceship(), state, new SpaceManager(), die);
            for (let i = 0; i < 40; i++) {
                die.expectedRoll = (i % 4) / 2 + 0.6; // walk across the range / surface rolls
                dm.damageSystem(radar, { id: `hit${i}`, amount: 1 }, 1);
            }
            const expected =
                radar.design.bearingLimit * (1 - Math.abs(radar.bearingSkew) / radar.design.maxBearingSkew);
            expect(radar.bearingLimit).to.be.closeTo(expected, 0.001);
        });
    });

    describe('repair', () => {
        it('no protocol targets bearingLimitFactor any more', () => {
            for (const protocol of Object.values(repairProtocols)) {
                expect(protocol.targets.map((target) => target.field)).to.not.include('bearingLimitFactor');
            }
        });

        it('restoring skew to normal restores the traverse', () => {
            const mount = makeBeam();
            mount.bearingSkew = 30;
            expect(mount.bearingLimit).to.be.lessThan(180);
            mount.bearingSkew = 0;
            expect(mount.bearingLimit).to.equal(180);
        });
    });
});
