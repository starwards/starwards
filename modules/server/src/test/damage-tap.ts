import { Damage } from '@starwards/core/internal';
import { HeadlessGame } from './headless-game';

/**
 * Observes every damage event as a ship's damage manager drains it, by wrapping
 * `SpaceManager.resolveObjectDamage` (looked up on every call, so installing after
 * `HeadlessGame.start` misses nothing -- `start` never ticks). Pass-through: the damage is untouched.
 */
export function tapDamage(game: HeadlessGame, onDamage: (targetId: string, damage: Damage) => void) {
    const { spaceManager } = game;
    const resolve = spaceManager.resolveObjectDamage.bind(spaceManager);
    spaceManager.resolveObjectDamage = function* (id: string) {
        for (const damage of resolve(id)) {
            onDamage(id, damage);
            yield damage;
        }
    };
}

/**
 * Observes every ship `SpaceManager.convertToDerelict` actually converts: combat deaths, and the
 * write-offs a scenario applies the same way. Pass-through.
 */
export function tapDerelicts(game: HeadlessGame, onConverted: (shipId: string) => void) {
    const { spaceManager } = game;
    const convert = spaceManager.convertToDerelict.bind(spaceManager);
    spaceManager.convertToDerelict = (id: string) => {
        const wasLive = spaceManager.state.getShip(id)?.destroyed === false;
        convert(id);
        if (wasLive && spaceManager.state.getShip(id)?.destroyed) {
            onConverted(id);
        }
    };
}
