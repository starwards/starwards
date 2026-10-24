import { Explosion, ShipManagerNpc, SpaceManager, Spaceship, Vec2, makeShipState, shipConfigurations } from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';
import { expect } from 'chai';

function armorHealth(shipMgr: ShipManagerNpc) {
    let sum = 0;
    for (const plate of shipMgr.state.armor.armorPlates) {
        for (const layer of plate.layers) {
            sum += layer.health;
        }
    }
    return sum;
}

function platesDamaged(shipMgr: ShipManagerNpc) {
    return shipMgr.state.armor.armorPlates.filter((plate) => plate.broken).length;
}

function detonate(blastRadius: number) {
    const config = shipConfigurations['dragonfly-MK1'];
    const ship = new Spaceship();
    ship.id = 'target';
    ship.radius = config.radius;
    ship.position = Vec2.make({ x: 0, y: 0 });
    const spaceMgr = new SpaceManager();
    const shipMgr = new ShipManagerNpc(ship, makeShipState(ship.id, config), spaceMgr, new MockDie());
    spaceMgr.insert(ship);
    const blast = new Explosion();
    blast.id = 'blast';
    blast.position = Vec2.make({ x: 0, y: 0 });
    blast.damageFactor = Number.MAX_SAFE_INTEGER;
    blast.radius = blastRadius;
    blast.expansionSpeed = 0;
    blast.secondsToLive = 1;
    blast.velocityInheritance = 0;
    spaceMgr.insert(blast);
    spaceMgr.forceFlushEntities();
    const before = armorHealth(shipMgr);
    for (const id of makeIterationsData(0.5, 30)) {
        spaceMgr.update(id);
        shipMgr.update(id);
    }
    return {
        ship,
        blast,
        lost: before - armorHealth(shipMgr),
        plates: platesDamaged(shipMgr),
        total: shipMgr.state.armor.armorPlates.length,
    };
}

function queuedDamages(blastRadius: number, blastX: number) {
    const config = shipConfigurations['dragonfly-MK1'];
    const ship = new Spaceship();
    ship.id = 'target';
    ship.radius = config.radius;
    ship.position = Vec2.make({ x: 0, y: 0 });
    const spaceMgr = new SpaceManager();
    new ShipManagerNpc(ship, makeShipState(ship.id, config), spaceMgr, new MockDie());
    spaceMgr.insert(ship);
    const blast = new Explosion();
    blast.id = 'blast';
    blast.position = Vec2.make({ x: blastX, y: 0 });
    blast.radius = blastRadius;
    blast.expansionSpeed = 0;
    blast.secondsToLive = 1;
    blast.velocityInheritance = 0;
    spaceMgr.insert(blast);
    spaceMgr.forceFlushEntities();
    for (const id of makeIterationsData(0.02, 1)) {
        spaceMgr.update(id);
    }
    return (spaceMgr as unknown as { objectDamage: Map<string, unknown[]> }).objectDamage.get(ship.id);
}

describe('blast overlapping a hull without their rims crossing (issue #2363)', () => {
    it('damages a hull wholly inside the blast and marks it hit', () => {
        const { ship, blast, lost, plates, total } = detonate(shipConfigurations['dragonfly-MK1'].radius * 4);
        expect(lost).to.be.greaterThan(0.01);
        expect(plates, 'an engulfing blast reaches the whole rim').to.equal(total);
        expect(blast.hitObjectIds.has(ship.id)).to.equal(true);
    });
    it('damages a blast wholly inside the hull and marks it hit', () => {
        const { ship, blast, lost } = detonate(shipConfigurations['dragonfly-MK1'].radius / 4);
        expect(lost).to.be.greaterThan(0.01);
        expect(blast.hitObjectIds.has(ship.id)).to.equal(true);
    });
    it('delivers an engulfing or enclosed off-centre blast as a single weapon hit', () => {
        const radius = shipConfigurations['dragonfly-MK1'].radius;
        expect(queuedDamages(radius * 4, radius / 2)).to.have.length(1);
        expect(queuedDamages(radius / 4, radius / 2)).to.have.length(1);
    });
});
