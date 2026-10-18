import {
    Faction,
    GameMap,
    IdleStrategy,
    MissileAmmoType,
    Spaceship,
    Vec2,
    XY,
    ammoDesigns,
    isMissile,
    toPositiveDegreesDelta,
} from '@starwards/core/internal';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import { tapDamage, tapDerelicts } from '../damage-tap';

const LAUNCHER_ID = 'GVTS';
const TARGET_ID = 'target';
const TICK = 1 / SERVER_TICK_HZ;
/** Sim-seconds the tube gets to load and fire before the shot counts as never launched. */
const LAUNCH_CAP_SECONDS = 30;
/** Sim-seconds after the missile is gone, for its blast and damage to land. */
const SETTLE_SECONDS = 2;

/**
 * What the target does from the tick the missile leaves the tube: sits; runs straight away from
 * the launcher; or crosses the launch line square. Full afterburner speed, or cruise speed with
 * the `-cruise` suffix.
 */
export type TargetMotion = 'still' | 'fleeing' | 'fleeing-cruise' | 'crossing' | 'crossing-cruise';

type MissileShot = {
    /** The missile damaged the target at least once. */
    hit: boolean;
    /** The target died. */
    killed: boolean;
};

function missileRangeMap(rangeMeters: number, bearing: number): GameMap {
    return {
        name: 'missile-range',
        init: (game) => {
            const ship = new Spaceship().init(LAUNCHER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas);
            const launcher = game.addPlayerSpaceship(ship);
            ship.angle = bearing - launcher.state.tubes[0].fittedBearing;
            const target = game.addNpcSpaceship(
                new Spaceship().init(
                    TARGET_ID,
                    Vec2.make(XY.byLengthAndDirection(rangeMeters, bearing)),
                    'dragonfly-MK1',
                    Faction.Raiders,
                ),
            );
            target.state.idleStrategy = IdleStrategy.PLAY_DEAD;
        },
    };
}

/**
 * One missile of `ammo` from the GVTS's first tube, with the weapons lock held on a dragonfly-MK1
 * `rangeMeters` away on a seed-derived bearing. The target holds still until launch, then moves per
 * `motion` (kinematic: velocity pinned each tick, nose along it). Calibration instrument: the
 * target never evades, jams or shoots back.
 */
export function missileShot(
    seed: number,
    ammo: MissileAmmoType,
    rangeMeters: number,
    motion: TargetMotion,
): MissileShot {
    const bearing = (seed * 137) % 360;
    const game = HeadlessGame.start(missileRangeMap(rangeMeters, bearing), seed);
    let hit = false;
    let killed = false;
    tapDamage(game, (id) => (hit ||= id === TARGET_ID));
    tapDerelicts(game, (id) => (killed ||= id === TARGET_ID));
    const launcher = game.shipManagers.get(LAUNCHER_ID)!;
    const targetManager = game.shipManagers.get(TARGET_ID)!;
    const target = game.spaceManager.state.getShip(TARGET_ID)!;
    const tube = launcher.state.tubes[0];
    tube.projectile = ammo;
    const away = XY.byLengthAndDirection(1, bearing);
    const crossSign = seed % 2 === 0 ? 1 : -1;
    const course = motion.startsWith('crossing') ? XY.rotate(away, 90 * crossSign) : away;
    // the ship manager caps speed at the afterburner's limit
    targetManager.state.afterBurner = motion.endsWith('-cruise') ? 0 : 1;
    const speed = targetManager.state.maxSpeed;

    const launcherObject = game.spaceManager.state.getShip(LAUNCHER_ID)!;
    const scanBeam = launcher.state.radars.find((radar) => radar.design.isScanBeam)!;
    // the omni radar reaches 6 km: the lock rides on the scan beam, held on the target
    scanBeam.arc = scanBeam.design.minArc;
    const trackTarget = () => {
        const toTarget = XY.angleOf(XY.difference(target.position, launcherObject.position));
        scanBeam.bearingCommand = toPositiveDegreesDelta(toTarget - launcherObject.angle);
    };

    let missileId: string | undefined;
    const launchEnd = game.seconds + LAUNCH_CAP_SECONDS;
    while (!missileId && game.seconds < launchEnd) {
        target.velocity = Vec2.make({ x: 0, y: 0 });
        trackTarget();
        // the lock needs the target on radar, which the first tick computes
        if (launcher.state.weaponsTarget.targetId !== TARGET_ID) {
            launcher.setTarget(TARGET_ID);
        }
        if (launcher.state.weaponsTarget.targetId === TARGET_ID) {
            tube.safetyLocked = false;
            launcher.state.fireTubesCommand = true;
        }
        game.tick(TICK);
        missileId = [...game.spaceManager.state.getAll('Projectile')].find(isMissile)?.id;
    }
    if (!missileId) {
        throw new Error(`seed ${seed}: ${ammo} never launched within ${LAUNCH_CAP_SECONDS}s`);
    }
    const flightEnd = game.seconds + ammoDesigns[ammo].homing.secondsToLive + SETTLE_SECONDS;
    let settleEnd = Infinity;
    while (!killed && game.seconds < Math.min(flightEnd, settleEnd)) {
        if (motion !== 'still' && !target.destroyed) {
            target.velocity = Vec2.make(XY.scale(course, speed));
            target.angle = XY.angleOf(course);
            target.turnSpeed = 0;
        }
        trackTarget();
        if (launcher.state.weaponsTarget.targetId !== TARGET_ID && !target.destroyed) {
            launcher.setTarget(TARGET_ID);
        }
        game.tick(TICK);
        const missile = game.spaceManager.state.get(missileId);
        if (settleEnd === Infinity && (!missile || missile.destroyed)) {
            settleEnd = game.seconds + SETTLE_SECONDS;
        }
    }
    return { hit, killed };
}

type MissileRangeCell = {
    ammo: MissileAmmoType;
    motion: TargetMotion;
    rangeMeters: number;
    pHit: number;
    pKill: number;
};

/** P(hit) and P(kill) of one missile over `seeds`, for every ammo x motion x launch range. */
export function missileRangeSweep(
    ammos: readonly MissileAmmoType[],
    motions: readonly TargetMotion[],
    rangesMeters: readonly number[],
    seeds: readonly number[],
): MissileRangeCell[] {
    const cells: MissileRangeCell[] = [];
    for (const ammo of ammos) {
        for (const motion of motions) {
            for (const rangeMeters of rangesMeters) {
                const shots = seeds.map((seed) => missileShot(seed, ammo, rangeMeters, motion));
                cells.push({
                    ammo,
                    motion,
                    rangeMeters,
                    pHit: shots.filter((s) => s.hit).length / shots.length,
                    pKill: shots.filter((s) => s.killed).length / shots.length,
                });
            }
        }
    }
    return cells;
}
