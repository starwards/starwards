import {
    BLAST_LIFETIME_FACTOR,
    BLAST_VELOCITY_INHERITANCE,
    Projectile,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';

import { MockDie } from './ship-test-harness';

/**
 * Design-KB probe (product/ttk-2026-09-12.md) measured only ~1.8% of ~3,600 HiExp blasts ever
 * registering on a moving dragonfly-MK1: blasts spawn near the hull inheriting the shell's full
 * velocity, so the still-growing cloud flies past instead of overlapping a target that keeps
 * moving under it (issue #2252). This probe reproduces the mechanism -- an unguided HiExpShell
 * fired at a moving target with varying standoff and lead quality -- and shows the registration
 * rate move between the pre-#2252 physics (full velocity inheritance) and the shipped fix.
 */

const TICK_SECONDS = 0.02;
const BULLET_SPEED = 2000; // gravitasChaingun muzzle speed

type Scenario = { standoffDistance: number; leadFraction: number; targetSpeed: number };

const SCENARIOS: Scenario[] = [];
for (const standoffDistance of [500, 1000, 1500, 2000]) {
    for (const leadFraction of [0, 0.25, 0.5, 0.75, 1, 1.25]) {
        for (const targetSpeed of [50, 100, 150]) {
            SCENARIOS.push({ standoffDistance, leadFraction, targetSpeed });
        }
    }
}

function totalArmorHealth(shipMgr: ShipManagerNpc) {
    let sum = 0;
    for (const plate of shipMgr.state.armor.armorPlates) {
        for (const layer of plate.layers) {
            sum += layer.health;
        }
    }
    return sum;
}

/** fires one HiExpShell at a moving dragonfly-MK1 and reports whether its blast ever registered */
function fireOneShot(
    scenario: Scenario,
    explosionOverrides: { velocityInheritance: number; secondsToLive?: number; expansionSpeed?: number },
): boolean {
    const config = shipConfigurations['dragonfly-MK1'];
    const ship = new Spaceship();
    ship.id = 'target';
    ship.radius = config.radius;
    ship.position = Vec2.make({ x: 0, y: 0 });
    ship.velocity = Vec2.make({ x: 0, y: scenario.targetSpeed });
    const spaceMgr = new SpaceManager();
    const shipMgr = new ShipManagerNpc(ship, makeShipState(ship.id, config), spaceMgr, new MockDie());
    spaceMgr.insert(ship);
    spaceMgr.forceFlushEntities();
    const before = totalArmorHealth(shipMgr);

    const flightTimeApprox = scenario.standoffDistance / BULLET_SPEED;
    const aimPoint = XY.sum(ship.position, XY.scale(ship.velocity, scenario.leadFraction * flightTimeApprox));
    const shooterPos = Vec2.make({ x: -scenario.standoffDistance, y: 0 });
    const dir = XY.normalize(XY.difference(aimPoint, shooterPos));

    const shell = new Projectile('HiExpShell');
    shell.shipId = 'shooter';
    shell.velocity = Vec2.make(XY.scale(dir, BULLET_SPEED));
    shell.secondsToLive = flightTimeApprox * 4 + 2;
    shell.init('shell', shooterPos);

    const explosion = shell.makeExplosion();
    explosion.velocityInheritance = explosionOverrides.velocityInheritance;
    if (explosionOverrides.secondsToLive !== undefined) explosion.secondsToLive = explosionOverrides.secondsToLive;
    if (explosionOverrides.expansionSpeed !== undefined) explosion.expansionSpeed = explosionOverrides.expansionSpeed;
    shell._explosion = explosion;

    spaceMgr.insert(shell);
    spaceMgr.forceFlushEntities();

    const totalTicks = Math.ceil((flightTimeApprox * 4 + 5) / TICK_SECONDS);
    for (let i = 0; i < totalTicks; i++) {
        const id = { deltaSeconds: TICK_SECONDS, deltaSecondsAvg: TICK_SECONDS, totalSeconds: TICK_SECONDS * (i + 1) };
        spaceMgr.update(id);
        shipMgr.update(id);
    }
    return before - totalArmorHealth(shipMgr) > 0.01;
}

function registrationRate(explosionOverrides: {
    velocityInheritance: number;
    secondsToLive?: number;
    expansionSpeed?: number;
}): number {
    const hits = SCENARIOS.filter((s) => fireOneShot(s, explosionOverrides)).length;
    return hits / SCENARIOS.length;
}

describe('blast registration rate against a moving dragonfly-MK1 (issue #2252)', () => {
    it('damping the inherited velocity and shortening blast lifetime substantially raises how often a blast registers', () => {
        // reconstruct pre-#2252 HiExpShell physics by undoing BLAST_LIFETIME_FACTOR on top of
        // full velocity inheritance -- SHELL_BLAST_SIZE_FACTOR (unrelated to this issue) still
        // applies underneath, via makeExplosion()
        const reference = new Projectile('HiExpShell').makeExplosion();
        const before = registrationRate({
            velocityInheritance: 1,
            secondsToLive: reference.secondsToLive * BLAST_LIFETIME_FACTOR,
            expansionSpeed: reference.expansionSpeed / BLAST_LIFETIME_FACTOR,
        });
        // the shipped fix: default velocityInheritance, and whatever lifetime/expansion the
        // warhead table now carries (already shortened by BLAST_LIFETIME_FACTOR)
        const after = registrationRate({ velocityInheritance: BLAST_VELOCITY_INHERITANCE });

        // eslint-disable-next-line no-console
        console.log(
            `blast registration rate over ${SCENARIOS.length} shots at a moving dragonfly-MK1: ` +
                `before=${(before * 100).toFixed(1)}%, after=${(after * 100).toFixed(1)}%`,
        );

        expect(before).toBeLessThan(0.3);
        expect(after).toBeGreaterThan(before * 2);
        expect(after).toBeGreaterThan(0.5);
    });
});
