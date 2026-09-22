import {
    Faction,
    Order,
    ShipManager,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';
import { ShipDie } from '../src/ship/ship-die';
import { expect } from 'chai';
import { makeIterationsData } from './ship-test-harness';

const HZ = 60;
const SIM_SECONDS = 300;

/**
 * A GVTS on an ATTACK order against a dragonfly-MK1 held in place (position and velocity reset
 * every tick, so blast knock-back can't carry it out of the fight; `freeze` would make it
 * invulnerable). Only a breached capsule kills, and the capsule is internal, so HiExp -- which
 * penetrates internal systems -- is the kill path; Frag only disables hull-mounted systems.
 */
function runPinnedDragonflyAttack() {
    const spaceMgr = new SpaceManager();
    // A real, seeded die: MockDie's default roll succeeds every damage roll and kills in seconds.
    const die = new ShipDie(1);
    const ships = new Map<string, ShipManager>();
    const attacker = new Spaceship().init('attacker', Vec2.make(XY.zero), 'gravitas', Faction.Gravitas);
    const attackerMgr = new ShipManagerNpc(
        attacker,
        makeShipState(attacker.id, shipConfigurations.gravitas),
        spaceMgr,
        die,
        ships,
    );
    const target = new Spaceship().init('target', Vec2.make({ x: 3000, y: 0 }), 'dragonfly-MK1', Faction.Raiders);
    const targetMgr = new ShipManagerNpc(
        target,
        makeShipState(target.id, shipConfigurations['dragonfly-MK1']),
        spaceMgr,
        die,
        ships,
    );
    ships.set(attacker.id, attackerMgr);
    ships.set(target.id, targetMgr);
    target.expendable = true;
    spaceMgr.insert(attacker);
    spaceMgr.insert(target);
    spaceMgr.forceFlushEntities();
    attackerMgr.state.order = Order.ATTACK;
    attackerMgr.state.orderTargetId = target.id;

    const home = XY.clone(target.position);
    const [gun] = attackerMgr.state.chainGuns;
    let armorStrippedAt: number | null = null;
    const projectilesFired = new Set<string>();
    let killedAt: number | null = null;
    let maxBroken = 0;
    for (const id of makeIterationsData(SIM_SECONDS, SIM_SECONDS * HZ)) {
        die.update(id);
        attackerMgr.update(id);
        targetMgr.update(id);
        spaceMgr.update(id);
        const broken = targetMgr.state.systems().filter((s) => s.broken).length;
        maxBroken = Math.max(maxBroken, broken);
        if (target.destroyed) {
            killedAt = id.totalSeconds;
            break;
        }
        target.position.x = home.x;
        target.position.y = home.y;
        target.velocity.x = 0;
        target.velocity.y = 0;
        if (armorStrippedAt === null && targetMgr.state.armor.armorPlates.every((p) => p.broken)) {
            armorStrippedAt = id.totalSeconds;
        }
        projectilesFired.add(gun.projectile);
    }
    return {
        armorStrippedAt,
        projectiles: [...projectilesFired],
        killedAt,
        capsule: targetMgr.state.capsule.integrity,
        maxBroken,
    };
}

describe('NPC ammo doctrine against a dragonfly-MK1', () => {
    jest.setTimeout(120_000);

    it('fires HiExp, strips the armor, breaches the capsule and kills the target', () => {
        const result = runPinnedDragonflyAttack();
        const summary = JSON.stringify(result);

        expect(result.projectiles, summary).to.deep.equal(['HiExpShell']);
        expect(result.armorStrippedAt, summary).to.not.equal(null);
        expect(result.killedAt, summary).to.not.equal(null);
        expect(result.capsule, summary).to.equal(0);
    });
});
