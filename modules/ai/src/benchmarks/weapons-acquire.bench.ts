import {
    Faction,
    IdleStrategy,
    Projectile,
    SpaceObject,
    Spaceship,
    Vec2,
    XY,
    blastRadius,
    shipConfigurations,
} from '@starwards/core/internal';

import { Benchmark } from './benchmark';
import { BlastOverlaps } from '@starwards/server/src/test/blast-overlaps';
import fc from 'fast-check';
import { offNose } from '../brain/verbal';

const SHIP = 'GVTS';
const ENEMY = 'raider';
const FRIEND = 'wingman';
/** A blast on the friend costs this many hits on the enemy. */
const FRIENDLY_FIRE_WEIGHT = 10;
const OFF_LINE_METERS = blastRadius('HiExpShell');

type Params = { enemyDistance: number; enemyBearing: number; friendExtra: number; friendOffset: number };

/**
 * Acquire: two dragonflies that never thrust nor shoot, a Raiders one 1.5–4 km away within 90° of
 * the nose and a Gravitas wingman 1–3 km beyond it, at most 30° to its side, so it is a tempting
 * lock and sits near the line of fire. Helms is the fixed `reference` pilot, which turns the nose
 * onto whatever weapons locks (it parks behind the nearest ship: the enemy). The weapons officer
 * must lock the enemy, not the wingman, and shoot it without hitting the wingman. Score, per minute
 * of run: blast hits on the enemy, minus off-line shells (as in `weapons-range`), minus 10 per blast
 * on the wingman, minus the seconds weapons held a lock on anything but the enemy. Ends at 45 s or
 * when the enemy dies.
 */
const weaponsAcquire: Benchmark<Params> = {
    name: 'weapons-acquire',
    station: 'weapons',
    description: 'lock the enemy, not the friendly wingman beside it, and shoot only the enemy',
    params: fc.record({
        enemyDistance: fc.integer({ min: 1500, max: 4000 }),
        enemyBearing: fc.integer({ min: -90, max: 90 }),
        friendExtra: fc.integer({ min: 1000, max: 3000 }),
        friendOffset: fc.integer({ min: -30, max: 30 }),
    }),
    createMap: ({ enemyDistance, enemyBearing, friendExtra, friendOffset }) => ({
        name: 'bench_weapons_acquire',
        init: (game) => {
            game.addPlayerSpaceship(new Spaceship().init(SHIP, new Vec2(0, 0), 'gravitas', Faction.Gravitas));
            const place = (id: string, distance: number, bearing: number, faction: Faction) => {
                const position = XY.byLengthAndDirection(distance, bearing);
                const state = game.addNpcSpaceship(
                    new Spaceship().init(id, Vec2.make(position), 'dragonfly-MK1', faction),
                ).state;
                state.idleStrategy = IdleStrategy.PLAY_DEAD;
                // as on training rung T0: blast knock-back must not fling it faster than the GVTS flies
                state.smartPilot.design.maxSpeed = shipConfigurations.gravitas.smartPilot.maxSpeed;
                state.smartPilot.design.maxSpeedFromAfterBurner = shipConfigurations.gravitas.smartPilot.maxSpeed;
            };
            place(ENEMY, enemyDistance, enemyBearing, Faction.Raiders);
            place(FRIEND, enemyDistance + friendExtra, enemyBearing + friendOffset, Faction.Gravitas);
        },
    }),
    shipId: SHIP,
    timeoutSeconds: 45,
    supporting: [{ station: 'helms', policy: 'reference' }],
    scorer: () => {
        const blasts = new BlastOverlaps();
        const seenShells = new Set<string>();
        let hits = 0;
        let friendlyHits = 0;
        let shells = 0;
        let offLine = 0;
        let wrongLockSeconds = 0;
        let firstEnemyLock = NaN;
        let seconds = 0;
        return {
            sample(game, dt) {
                seconds += dt;
                const enemy = game.spaceManager.state.get(ENEMY);
                const friend = game.spaceManager.state.get(FRIEND);
                const ship = game.spaceManager.state.get(SHIP);
                const lock = game.api.getShip(SHIP)?.state.weaponsTarget.targetId;
                if (!enemy || !ship) return;
                if (lock && lock !== ENEMY) wrongLockSeconds += dt;
                if (lock === ENEMY && Number.isNaN(firstEnemyLock)) firstEnemyLock = game.seconds;
                const objects = [...game.spaceManager.state];
                for (const o of objects) {
                    if (Projectile.isInstance(o) && o.shipId === SHIP && !seenShells.has(o.id)) {
                        seenShells.add(o.id);
                        shells++;
                        const sight = XY.difference(enemy.position, ship.position);
                        const off = Math.abs(offNose(XY.angleOf(sight), ship.angle));
                        const aside = off >= 90 ? Infinity : XY.lengthOf(sight) * Math.sin((off * Math.PI) / 180);
                        if (aside > OFF_LINE_METERS) offLine++;
                    }
                }
                const onto = [enemy, ...(friend ? [friend] : [])] as SpaceObject[];
                for (const [, hit] of blasts.next(objects, onto)) {
                    if (hit.id === ENEMY) hits++;
                    else friendlyHits++;
                }
            },
            done: (game) => !!game.spaceManager.state.get(ENEMY)?.destroyed,
            result: () => ({
                score: seconds
                    ? ((hits - offLine - FRIENDLY_FIRE_WEIGHT * friendlyHits - wrongLockSeconds) * 60) / seconds
                    : 0,
                hits,
                friendlyHits,
                shells,
                offLine,
                wrongLockSeconds,
                firstEnemyLock,
            }),
        };
    },
};

export default weaponsAcquire;
