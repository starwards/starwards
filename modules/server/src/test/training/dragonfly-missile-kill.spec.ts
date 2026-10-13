import { Faction, GameMap, IdleStrategy, Projectile, Spaceship, Vec2, XY } from '@starwards/core/internal';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';

import fc from 'fast-check';
import { tapDerelicts } from '../damage-tap';

const TARGET_ID = 'target';
const STANDOFF = 2000;
const MAX_MISSILES = 12;
const PER_MISSILE_CAP_SECONDS = 15;
const TICK = 1 / SERVER_TICK_HZ;

function dragonflyMap(): GameMap {
    return {
        name: 'dragonfly-missile-kill',
        init: (game) => {
            const target = game.addNpcSpaceship(
                new Spaceship().init(TARGET_ID, new Vec2(0, 0), 'dragonfly-MK1', Faction.Raiders),
            );
            target.state.idleStrategy = IdleStrategy.PLAY_DEAD;
        },
    };
}

/**
 * Missiles until the idle dragonfly-MK1 dies. Every missile comes in on `bearing` (degrees, world frame)
 * from {@link STANDOFF} m: ArmPen while no plate is broken (breach), then HiExp through the opened arc.
 * `Infinity` if it survives {@link MAX_MISSILES}.
 */
function missilesToKill(seed: number, bearing: number, maxMissiles = MAX_MISSILES): number {
    const game = HeadlessGame.start(dragonflyMap(), seed);
    let killed = false;
    tapDerelicts(game, (id) => (killed ||= id === TARGET_ID));
    const target = game.spaceManager.state.getShip(TARGET_ID)!;
    const { armor } = game.shipManagers.get(TARGET_ID)!.state;
    for (let n = 1; n <= maxMissiles; n++) {
        // each missile meets the target at rest: measures the warheads, not a chase after knock-back
        target.velocity = Vec2.make({ x: 0, y: 0 });
        target.turnSpeed = 0;
        const breached = armor.armorPlates.some((p) => p.broken);
        const missile = new Projectile(breached ? 'HiExpMissile' : 'ArmPenMissile');
        const from = Vec2.make(XY.add(target.position, XY.byLengthAndDirection(STANDOFF, bearing)));
        missile.init(`missile-${n}`, from);
        missile.velocity = Vec2.make(XY.byLengthAndDirection(missile.design.homing!.maxSpeed, bearing + 180));
        missile.angle = bearing + 180;
        missile.targetId = TARGET_ID;
        missile.secondsToLive = missile.design.homing!.secondsToLive;
        game.spaceManager.insert(missile);
        game.spaceManager.forceFlushEntities();
        const end = game.seconds + PER_MISSILE_CAP_SECONDS;
        while (!killed && game.seconds < end) {
            game.tick(TICK);
        }
        if (killed) {
            return n;
        }
    }
    return Infinity;
}

const LIMIT = 4;

/**
 * Ruling (Amir, 2026-10-04): a dragonfly must not survive more than 3-4 well-aimed Gravitas missiles.
 *
 * Met by the missile concentration column (#1968). Measured 2026-10-12, seeds 1-16, bearing
 * (seed * 137) mod 360: 2-4 missiles, median 3 (before: 21-54, median 40).
 */
describe('balance benchmark: Gravitas missiles vs dragonfly-MK1 (#2334)', () => {
    it(
        `dies within ${LIMIT} well-aimed missiles (ArmPen to breach, then HiExp), any seed and bearing`,
        () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 1_000_000 }),
                    fc.double({ min: 0, max: 360, noNaN: true }),
                    (seed, bearing) => {
                        expect(missilesToKill(seed, bearing)).toBeLessThanOrEqual(LIMIT);
                    },
                ),
                { numRuns: 32 },
            );
        },
        10 * 60 * 1000,
    );
});
