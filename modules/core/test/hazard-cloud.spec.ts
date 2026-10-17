import { Faction, HazardCloud, Projectile, SpaceManager, Spaceship, Vec2, isSensorInvisible } from '../src';

import { SpaceSimulator } from './simulator';
import { expect } from 'chai';

function shellAt(id: string, x: number, vx: number) {
    const shell = new Projectile('HiExpShell').init(id, Vec2.make({ x, y: 0 }));
    shell.velocity = Vec2.make({ x: vx, y: 0 });
    shell.secondsToLive = 100;
    return shell;
}

function hullDamageWhileCrossing(speed: number) {
    const cloud = new HazardCloud().init('cloud', Vec2.make({ x: 0, y: 0 }), 1000);
    const ship = new Spaceship().init('ship', Vec2.make({ x: 0, y: 0 }), 'dragonfly-MK1', Faction.Gravitas);
    ship.radius = 50;
    ship.velocity = Vec2.make({ x: speed, y: 0 });
    let total = 0;
    const collect = (mgr: SpaceManager) => {
        for (const d of mgr.resolveObjectDamage('ship')) total += d.amount;
    };
    new SpaceSimulator(20).withObjects(cloud, ship).simulateUntilTime(1, collect);
    return total;
}

describe('HazardCloud (M4.40)', () => {
    it('is sensor-invisible and non-corporal: never a scan/weapons target, never blocks line of sight', () => {
        const cloud = new HazardCloud().init('c', Vec2.make({ x: 0, y: 0 }), 500);
        expect(isSensorInvisible(cloud)).to.equal(true);
        expect(cloud.isCorporal).to.equal(false);
    });

    it('wears down a shell crossing it until it is destroyed, without detonating', () => {
        const cloud = new HazardCloud().init('cloud', Vec2.make({ x: 0, y: 0 }), 100_000);
        const shell = shellAt('shell', 0, 10);
        const sim = new SpaceSimulator(20).withObjects(cloud, shell);
        sim.simulateUntilTime(100 / cloud.projectileAttritionRate);
        expect(shell.destroyed).to.equal(true);
        expect([...sim.spaceMgr.state.getAll('Explosion')].length).to.equal(0);
    });

    it('does not wear down a shell outside it', () => {
        const cloud = new HazardCloud().init('cloud', Vec2.make({ x: 0, y: 0 }), 100);
        const shell = shellAt('shell', 5000, 0);
        new SpaceSimulator(20).withObjects(cloud, shell).simulateUntilTime(5);
        expect(shell.secondsToLive).to.be.closeTo(95, 0.1);
    });

    it('damages a ship inside it, and slow transit is cheaper than fast', () => {
        const slow = hullDamageWhileCrossing(50);
        const fast = hullDamageWhileCrossing(400);
        expect(fast).to.be.greaterThan(0);
        expect(slow).to.be.lessThan(fast / 4);
    });

    it('does not damage a stationary ship', () => {
        expect(hullDamageWhileCrossing(0)).to.equal(0);
    });
});
