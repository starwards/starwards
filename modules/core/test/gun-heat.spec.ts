import {
    ChainGun,
    ShipManagerPc,
    SpaceManager,
    Spaceship,
    makeShipState,
    repairProtocols,
    shipConfigurations,
} from '../src';
import { GUN_HEAT, gunHeatBars, gunHeatSpreadFactor } from '../src/ship/gun-heat';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';
import { getSystems } from '../src/ship/system';

class SpreadDie extends MockDie {
    public deviations: number[] = [];
    public override getGaussian(_id: string, mean: number, stdev: number): number {
        this.deviations.push(stdev);
        return mean;
    }
}

function setup(die = new SpreadDie()) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'gun-heat';
    const shipMgr = new ShipManagerPc(
        shipObj,
        makeShipState(shipObj.id, shipConfigurations['demo-ship']),
        spaceMgr,
        die,
    );
    spaceMgr.insert(shipObj);
    const gun = shipMgr.state.chainGuns[0];
    gun.projectile = 'HiExpShell';
    return { die, spaceMgr, shipMgr, gun };
}

/** Ticks with the trigger held and the chamber refilled, with heat pinned so only the model under test moves it. */
function fireFor(ctx: ReturnType<typeof setup>, seconds: number, pinHeat?: number) {
    for (const id of makeIterationsData(seconds, 20)) {
        ctx.gun.isFiring = true;
        if (pinHeat !== undefined) ctx.gun.heat = pinHeat;
        ctx.shipMgr.update(id);
        ctx.spaceMgr.update(id);
    }
}

function shotsFired(ctx: ReturnType<typeof setup>) {
    return ctx.die.deviations.length;
}

describe('gun heat model', () => {
    describe('bars', () => {
        it('are 50/80 on a pristine barrel and 25/60 at full wear, interpolated between', () => {
            expect(gunHeatBars(0)).to.deep.equal({ spreadBar: 50, jamBar: 80 });
            expect(gunHeatBars(1)).to.deep.equal({ spreadBar: 25, jamBar: 60 });
            expect(gunHeatBars(0.5)).to.deep.equal({ spreadBar: 37.5, jamBar: 70 });
        });
    });

    describe('spread', () => {
        it('is unchanged below the spread bar and grows above it', () => {
            expect(gunHeatSpreadFactor(0, 49.9)).to.equal(1);
            expect(gunHeatSpreadFactor(0, 70)).to.be.greaterThan(1);
            expect(gunHeatSpreadFactor(0, 90)).to.be.greaterThan(gunHeatSpreadFactor(0, 70));
        });

        it('widens the shot deviation of a hot gun over a cold one', () => {
            const cold = setup();
            fireFor(cold, 1, 10);
            const hot = setup();
            fireFor(hot, 1, 65);
            expect(shotsFired(cold)).to.be.greaterThan(0);
            expect(hot.die.deviations[0]).to.be.greaterThan(cold.die.deviations[0]);
        });

        it('widens the base spread of a worn barrel', () => {
            const pristine = setup();
            fireFor(pristine, 1, 10);
            const worn = setup();
            worn.gun.barrelWear = 1;
            fireFor(worn, 1, 10);
            expect(worn.die.deviations[0]).to.be.greaterThan(pristine.die.deviations[0]);
        });

        it('starts earlier on a worn barrel (lowered spread bar)', () => {
            expect(gunHeatSpreadFactor(1, 30)).to.be.greaterThan(1);
            expect(gunHeatSpreadFactor(0, 30)).to.equal(1);
        });
    });

    describe('jam band', () => {
        it('never jams below the jam bar', () => {
            const ctx = setup();
            ctx.die.expectedRoll = 0; // every roll is a failure
            fireFor(ctx, 2, GUN_HEAT.jamBar - 1);
            expect(ctx.gun.jammedSeconds).to.equal(0);
            expect(shotsFired(ctx)).to.be.greaterThan(5);
        });

        it('jams in the jam band, stops the gun, then clears after the jam time', () => {
            const ctx = setup();
            ctx.die.expectedRoll = 0;
            fireFor(ctx, 0.5, 90);
            expect(ctx.gun.jammedSeconds).to.be.greaterThan(0);
            const frozen = shotsFired(ctx);
            fireFor(ctx, 1, 90); // still jammed: pinned heat keeps it in the band but it cannot fire
            expect(shotsFired(ctx)).to.equal(frozen);
            ctx.die.expectedRoll = 0.99; // no new jam once cleared
            fireFor(ctx, GUN_HEAT.jamSeconds + 1, 90);
            expect(ctx.gun.jammedSeconds).to.equal(0);
            expect(shotsFired(ctx)).to.be.greaterThan(frozen);
        });

        it('jams from a lower heat on a worn barrel', () => {
            const ctx = setup();
            ctx.die.expectedRoll = 0;
            ctx.gun.barrelWear = 1;
            fireFor(ctx, 0.5, 65); // under the pristine jam bar (80), over the worn one (60)
            expect(ctx.gun.jammedSeconds).to.be.greaterThan(0);
        });
    });

    describe('forced cooldown', () => {
        it('locks the gun at 100 until heat falls to 70', () => {
            const ctx = setup();
            ctx.die.expectedRoll = 0.99;
            ctx.gun.heat = 100;
            fireFor(ctx, 0.2);
            expect(ctx.gun.cooling).to.equal(true);
            const before = shotsFired(ctx);
            for (const heat of [99, 85, 71]) {
                ctx.gun.heat = heat;
                fireFor(ctx, 0.2);
                expect(ctx.gun.cooling, `cooling at ${heat}`).to.equal(true);
            }
            expect(shotsFired(ctx)).to.equal(before);
            ctx.gun.heat = 70;
            fireFor(ctx, 0.2);
            expect(ctx.gun.cooling).to.equal(false);
            expect(shotsFired(ctx)).to.be.greaterThan(before);
        });
    });

    describe('barrel wear', () => {
        it('is reported as a defect once non-zero', () => {
            const { shipMgr, gun } = setup();
            const system = getSystems(shipMgr.state).find((s) => s.state === gun)!;
            expect(system.defectibles.map((d) => d.field)).to.include('barrelWear');
            expect(system.getStatus()).to.equal('OK');
            gun.barrelWear = 0.3;
            expect(system.getStatus()).to.equal('DAMAGED');
        });

        it('grows while the gun sits at or above the jam bar, not below it', () => {
            const below = setup();
            below.die.expectedRoll = 0.99;
            fireFor(below, 2, GUN_HEAT.jamBar - 5);
            expect(below.gun.barrelWear).to.equal(0);
            const above = setup();
            above.die.expectedRoll = 0.99;
            fireFor(above, 2, GUN_HEAT.jamBar + 5);
            expect(above.gun.barrelWear).to.be.greaterThan(0);
        });

        it('takes the heat that used to damage the system as wear instead', () => {
            const { shipMgr, gun } = setup();
            gun.heat = 95;
            shipMgr['heatManager'].addHeat(20, gun);
            expect(gun.heat).to.equal(100);
            expect(gun.barrelWear).to.be.greaterThan(0);
            expect(gun.rateOfFireFactor).to.equal(1);
        });

        it('comes from weapon hits as well', () => {
            const { die, shipMgr, gun } = setup();
            gun.design.damage50 = 0; // guaranteed single defect per hit
            die.expectedRoll = 0.99; // not the skew coin flip, and past the rate-of-fire share
            shipMgr['damageManager'].damageSystem(gun, { id: 'hit', amount: 1 }, 1);
            expect(gun.barrelWear).to.be.greaterThan(0);
            expect(gun.rateOfFireFactor).to.equal(1);
        });

        it('is restored by the barrel replacement protocol, which takes the gun offline while it runs', () => {
            expect(repairProtocols.barrelReplacement.targets).to.deep.include({
                system: 'chainGuns',
                field: 'barrelWear',
            });
            for (const mode of Object.values(repairProtocols.barrelReplacement.modes)) {
                expect(mode.sideEffectSystems).to.include('chainGuns');
            }
        });
    });

    it('applies to NPC and player ships alike (shared manager)', () => {
        expect(ChainGun.isInstance(setup().gun)).to.equal(true);
    });
});
