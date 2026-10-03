import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { XY } from '@starwards/core/internal';

/** The missile the armorer loads. */
const MISSILE = 'HiExpMissile';
/** Launch band: past the missile's arming run, inside what it reaches in half its life. */
const MIN_RANGE_METERS = 1000;
const MAX_RANGE_METERS = 20_000;

/**
 * A scripted torpedo officer acting on the ship directly, for the torpedo-using reference crew: the
 * station console cannot release a tube's safety, so no seat can fire one. While weapons holds a
 * lock on a ship in the launch band, it loads every tube with HiExp missiles, releases the safeties
 * and fires every loaded tube; each tube re-locks as it fires. Tube power stays the engineer's call.
 */
export function tubeArmorer(shipId: string) {
    return (game: HeadlessGame) => {
        const ship = game.shipManagers.get(shipId)?.state;
        const body = game.spaceManager.state.get(shipId);
        if (!ship || !body) return;
        for (const tube of ship.tubes) {
            if (tube.projectile !== MISSILE) tube.projectile = MISSILE;
        }
        const target = ship.weaponsTarget.targetId ? game.spaceManager.state.get(ship.weaponsTarget.targetId) : null;
        if (!target || target.destroyed || target.type !== 'Spaceship') return;
        const distance = XY.distance(target.position, body.position);
        if (distance < MIN_RANGE_METERS || distance > MAX_RANGE_METERS) return;
        const ready = ship.tubes.filter((t) => t.loading >= 1 && t.loadedProjectile !== 'None');
        if (!ready.length) return;
        ready.forEach((t) => (t.safetyLocked = false));
        ship.fireTubesCommand = true;
    };
}
