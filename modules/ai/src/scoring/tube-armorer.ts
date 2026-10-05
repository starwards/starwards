import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { XY } from '@starwards/core/internal';

/** The missile the armorer loads. */
const MISSILE = 'HiExpMissile';
/** Launch band: past the missile's arming run, inside what it reaches in half its life. */
const MIN_RANGE_METERS = 1000;
const MAX_RANGE_METERS = 20_000;
/** One missile at a time, this far apart: a salvo spends the magazine on a target the first hits already fling. */
export const LAUNCH_INTERVAL_SECONDS = 10;

/**
 * A scripted torpedo officer acting on the ship directly, for the torpedo-using reference crew: the
 * station console cannot release a tube's safety, so no seat can fire one. While weapons holds a
 * lock on a ship in the launch band, it fires one loaded tube every {@link LAUNCH_INTERVAL_SECONDS},
 * releasing that tube's safety; the tube re-locks as it fires. It loads HiExp missiles while the
 * magazine holds any, and unloads the tubes once it holds none, so an empty tube stops drawing
 * energy to load. Tube power stays the engineer's call.
 */
export function tubeArmorer(shipId: string) {
    let lastLaunch = -Infinity;
    return (game: HeadlessGame) => {
        const ship = game.shipManagers.get(shipId)?.state;
        const body = game.spaceManager.state.get(shipId);
        if (!ship || !body) return;
        const stocked = ship.magazine.getCount(MISSILE) > 0;
        for (const tube of ship.tubes) {
            const want = stocked || tube.loadedProjectile !== 'None' ? MISSILE : 'None';
            if (tube.projectile !== want) tube.projectile = want;
        }
        if (game.seconds - lastLaunch < LAUNCH_INTERVAL_SECONDS) return;
        const target = ship.weaponsTarget.targetId ? game.spaceManager.state.get(ship.weaponsTarget.targetId) : null;
        if (!target || target.destroyed || target.type !== 'Spaceship') return;
        const distance = XY.distance(target.position, body.position);
        if (distance < MIN_RANGE_METERS || distance > MAX_RANGE_METERS) return;
        const ready = ship.tubes.find((t) => t.loading >= 1 && t.loadedProjectile !== 'None');
        if (!ready) return;
        ready.safetyLocked = false;
        ship.fireTubesCommand = true;
        lastLaunch = game.seconds;
    };
}
