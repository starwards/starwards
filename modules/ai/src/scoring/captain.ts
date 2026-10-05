import { HeadlessGame } from '@starwards/server/src/test/headless-game';

/** How often the captain checks the lock, seconds. */
const CHECK_SECONDS = 0.5;

/**
 * A scripted captain for validation crews: priority is the captain's call, not weapons', so while
 * `targetId` lives the captain re-designates it as the ship's weapons target whenever the lock was
 * lost (blast clouds occlude the line of sight past the 1.5 s grace) or moved to another ship. It
 * designates through the ship manager, so a target out of sight is refused as a player's would be.
 * Weapons' share of time holding the designated lock is then what lock uptime measures.
 */
export function captain(shipId: string, targetId: string) {
    let nextCheck = 0;
    return (game: HeadlessGame) => {
        if (game.seconds < nextCheck) return;
        nextCheck = game.seconds + CHECK_SECONDS;
        const manager = game.shipManagers.get(shipId);
        const target = game.spaceManager.state.get(targetId);
        if (!manager || !target || target.destroyed) return;
        if (manager.state.weaponsTarget.targetId !== targetId) manager.setTarget(targetId);
    };
}
