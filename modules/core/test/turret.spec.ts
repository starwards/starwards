import { ChainGun, PowerLevel, Radar, Thruster, Turret, makeShipState, shipConfigurations, updateTurret } from '../src';

import { expect } from 'chai';

/**
 * The turret mount is shared by every system carried on a bearing (radars, chain guns, tubes,
 * thrusters), so it is exercised through one of them rather than through a purpose-built stub.
 */
function makeTurret(turnSpeed: number): Turret {
    const radar = new Radar();
    radar.design.assign({ turnSpeed });
    radar.power = PowerLevel.MAX;
    return radar;
}

describe('turret mount', () => {
    it('swings toward the commanded bearing at the design turn speed', () => {
        const turret = makeTurret(30);
        turret.bearingCommand = 90;

        updateTurret(turret, 1);

        expect(turret.bearing).to.be.closeTo(30, 0.001);
    });

    it('stops at the commanded bearing instead of overshooting it', () => {
        const turret = makeTurret(30);
        turret.bearingCommand = 10;

        updateTurret(turret, 1);

        expect(turret.bearing).to.be.closeTo(10, 0.001);
    });

    it('takes the short way around', () => {
        const turret = makeTurret(30);
        turret.bearing = 170;
        turret.bearingCommand = -170;

        updateTurret(turret, 1);

        // 20 degrees across the back of the ship, not 340 the other way
        expect(turret.bearing).to.be.closeTo(-170, 0.001);
    });

    it('keeps the bearing in [-180, 180] as it crosses the back of the ship', () => {
        const turret = makeTurret(30);
        turret.bearing = 170;
        turret.bearingCommand = -100;

        updateTurret(turret, 1);

        expect(turret.bearing).to.be.closeTo(-160, 0.001);
    });

    it('turns at a fraction of its speed when it is only partly effective', () => {
        const turret = makeTurret(30);
        turret.power = PowerLevel.NORMAL; // 0.5
        turret.bearingCommand = 90;

        updateTurret(turret, 1);

        expect(turret.bearing).to.be.closeTo(15, 0.001);
    });

    it('turns slower as its drive takes damage', () => {
        const turret = makeTurret(30);
        turret.turnSpeedFactor = 0.5;
        turret.bearingCommand = 90;

        updateTurret(turret, 1);

        expect(turret.bearing).to.be.closeTo(15, 0.001);
    });

    it('never moves when it is a fixed mount', () => {
        const turret = makeTurret(0);
        turret.bearing = -90;
        turret.bearingCommand = 90;

        updateTurret(turret, 10);

        expect(turret.bearing).to.equal(-90);
    });
});

describe('turret mount bearing limit (A2, A3)', () => {
    it('clamps a commanded bearing beyond the limit at write time, not once per tick', () => {
        const turret = makeTurret(1000);
        turret.design.assign({ bearingLimit: 30 });

        turret.bearingCommand = 90; // beyond the ±30 limit

        expect(turret.bearingCommand).to.be.closeTo(30, 0.001);
    });

    it('clamps a negative commanded bearing beyond the limit too', () => {
        const turret = makeTurret(1000);
        turret.design.assign({ bearingLimit: 30 });

        turret.bearingCommand = -90;

        expect(turret.bearingCommand).to.be.closeTo(-30, 0.001);
    });

    it('bearing is mount-relative: 0 means pointing at the fitted bearing', () => {
        const turret = makeTurret(1000);
        turret.fittedBearing = 90;
        turret.bearingCommand = 0;

        updateTurret(turret, 1);

        expect(turret.bearing).to.be.closeTo(0, 0.001);
        expect(turret.hullBearing).to.be.closeTo(90, 0.001);
    });

    it('does not restrict movement when bearingLimit is 180 (unrestricted, the default)', () => {
        const turret = makeTurret(1000);
        turret.bearingCommand = 179;

        updateTurret(turret, 1);

        expect(turret.bearing).to.be.closeTo(179, 0.001);
    });

    it('rotates through more than one full turn without unbounded bearing growth (A3)', () => {
        const turret = makeTurret(60);
        for (let i = 0; i < 20; i++) {
            // continuously chase a bearing far ahead of the current one, simulating a sweeping beam
            turret.bearingCommand = turret.bearing + 170;
            updateTurret(turret, 1);
        }
        expect(turret.bearing).to.be.at.least(-180);
        expect(turret.bearing).to.be.at.most(180);
    });

    it('a bearingLimitFactor below 1 clamps thereafter, taking the short way round', () => {
        const turret = makeTurret(1000);
        turret.design.assign({ bearingLimit: 90 });
        turret.bearingCommand = 90;
        updateTurret(turret, 1);
        expect(turret.bearing).to.be.closeTo(90, 0.001);

        turret.bearingLimitFactor = 0.5; // effective limit now ±45

        updateTurret(turret, 1);
        expect(turret.bearing).to.be.closeTo(45, 0.001);
    });
});

describe('turret hull bearing and global bearing (A1, A4, A5)', () => {
    it('hullBearing sums fittedBearing + bearingSkew + bearing, with no consumer computing it inline', () => {
        const turret = makeTurret(0);
        turret.fittedBearing = 45;
        turret.bearingSkew = 5;
        turret.bearing = 10;

        expect(turret.hullBearing).to.be.closeTo(60, 0.001);
    });

    it('getGlobalBearing adds the ship angle on top of hullBearing', () => {
        const turret = makeTurret(0);
        turret.fittedBearing = 45;
        turret.bearingSkew = 5;
        turret.bearing = 10;

        const parent = { angle: 20 } as Parameters<Turret['getGlobalBearing']>[0];
        expect(turret.getGlobalBearing(parent)).to.be.closeTo(80, 0.001);
    });

    it('a bolted mount (turnSpeed 0) still shows skew in getGlobalBearing — it does not fire dead ahead (A4)', () => {
        const chainGun = new ChainGun();
        chainGun.design.assign({ turnSpeed: 0, maxBearingSkew: 90 });
        chainGun.bearingSkew = 12;

        const parent = { angle: 0 } as Parameters<ChainGun['getGlobalBearing']>[0];
        expect(chainGun.getGlobalBearing(parent)).to.be.closeTo(12, 0.001);
    });

    it('bearingSkew may exceed bearingLimit — the clamp does not bound it (A5)', () => {
        const turret = makeTurret(0);
        turret.design.assign({ bearingLimit: 10, maxBearingSkew: 90 });

        turret.bearingSkew = 45;

        expect(turret.bearingSkew).to.be.closeTo(45, 0.001);
    });
});

describe('unified defectibles gate on design capability (A6, A9)', () => {
    it('an omni radar (no skew, no traverse surface) is never broken by skew', () => {
        const radar = new Radar();
        radar.design.assign({ turnSpeed: 0, maxBearingSkew: 0 });

        expect(radar.broken).to.equal(false);
    });

    it('a scan-beam radar with a skew surface is broken once skew reaches the design max', () => {
        const radar = new Radar();
        radar.design.assign({ turnSpeed: 30, maxBearingSkew: 45 });
        radar.bearingSkew = 45;

        expect(radar.broken).to.equal(true);
    });

    it('radar.broken still composes malfunctionRangeFactor (existing rule preserved)', () => {
        const radar = new Radar();
        radar.design.assign({ turnSpeed: 30, maxBearingSkew: 45, rangeEaseFactor: 0 });
        radar.malfunctionRangeFactor = 1;

        expect(radar.broken).to.equal(true);
    });

    it('a chain gun bent to its design limit is broken even with a healthy feed (deliberate change, A6)', () => {
        const chainGun = new ChainGun();
        chainGun.design.assign({ turnSpeed: 0, maxBearingSkew: 90 });
        chainGun.bearingSkew = 90;
        chainGun.rateOfFireFactor = 1;

        expect(chainGun.broken).to.equal(true);
    });

    it('a chain gun with a dead feed is broken regardless of skew', () => {
        const chainGun = new ChainGun();
        chainGun.design.assign({ turnSpeed: 0, maxBearingSkew: 90 });
        chainGun.bearingSkew = 0;
        chainGun.rateOfFireFactor = 0;

        expect(chainGun.broken).to.equal(true);
    });

    it('a thruster with full capacity and no skew is not broken', () => {
        const thruster = new Thruster();
        thruster.design.assign({ turnSpeed: 0, maxBearingSkew: 45 });

        expect(thruster.broken).to.equal(false);
    });

    it('a thruster at zero available capacity is broken even with no skew', () => {
        const thruster = new Thruster();
        thruster.design.assign({ turnSpeed: 0, maxBearingSkew: 45 });
        thruster.availableCapacity = 0;

        expect(thruster.broken).to.equal(true);
    });
});

describe('makeTube fits the mount, not just the launch heading (A10)', () => {
    it('a tube built at PORT has fittedBearing 90 and bearing 0', () => {
        const state = makeShipState('1', shipConfigurations['dragonfly-MK2']);

        expect(state.tubes.length).to.be.at.least(1);
        expect(state.tubes[0].fittedBearing).to.equal(90);
        expect(state.tubes[0].bearing).to.equal(0);
    });
});
