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
