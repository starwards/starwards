import { PowerLevel, Radar, Turret, updateTurret } from '../src';

import { expect } from 'chai';

/**
 * The turret mount is shared by every system carried on a bearing (radars, chain guns, tubes), so
 * it is exercised through one of them rather than through a purpose-built stub.
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
        turret.directionCommand = 90;

        updateTurret(turret, 1);

        expect(turret.direction).to.be.closeTo(30, 0.001);
    });

    it('stops at the commanded bearing instead of overshooting it', () => {
        const turret = makeTurret(30);
        turret.directionCommand = 10;

        updateTurret(turret, 1);

        expect(turret.direction).to.be.closeTo(10, 0.001);
    });

    it('takes the short way around', () => {
        const turret = makeTurret(30);
        turret.direction = 170;
        turret.directionCommand = -170;

        updateTurret(turret, 1);

        // 20 degrees across the back of the ship, not 340 the other way
        expect(turret.direction).to.be.closeTo(-170, 0.001);
    });

    it('keeps the bearing in [-180, 180] as it crosses the back of the ship', () => {
        const turret = makeTurret(30);
        turret.direction = 170;
        turret.directionCommand = -100;

        updateTurret(turret, 1);

        expect(turret.direction).to.be.closeTo(-160, 0.001);
    });

    it('turns at a fraction of its speed when it is only partly effective', () => {
        const turret = makeTurret(30);
        turret.power = PowerLevel.NORMAL; // 0.5
        turret.directionCommand = 90;

        updateTurret(turret, 1);

        expect(turret.direction).to.be.closeTo(15, 0.001);
    });

    it('turns slower as its drive takes damage', () => {
        const turret = makeTurret(30);
        turret.turnSpeedFactor = 0.5;
        turret.directionCommand = 90;

        updateTurret(turret, 1);

        expect(turret.direction).to.be.closeTo(15, 0.001);
    });

    it('never moves when it is a fixed mount', () => {
        const turret = makeTurret(0);
        turret.direction = -90;
        turret.directionCommand = 90;

        updateTurret(turret, 10);

        expect(turret.direction).to.equal(-90);
    });
});
