import { Explosion, SpaceObject, XY } from '@starwards/core/internal';

/**
 * First physical overlaps of explosions with objects, each explosion/object pair reported once
 * however many ticks it overlaps -- a blast hit, as opposed to what the shooter's fire control believed.
 */
export class BlastOverlaps {
    private readonly seen = new Set<string>();

    /** Pairs that overlap for the first time this tick. */
    *next(objects: Iterable<SpaceObject>, onto: readonly SpaceObject[]): Generator<[Explosion, SpaceObject]> {
        for (const explosion of objects) {
            if (!Explosion.isInstance(explosion) || explosion.destroyed) {
                continue;
            }
            for (const target of onto) {
                const key = `${explosion.id}/${target.id}`;
                if (
                    !this.seen.has(key) &&
                    XY.distance(explosion.position, target.position) < explosion.radius + target.radius
                ) {
                    this.seen.add(key);
                    yield [explosion, target];
                }
            }
        }
    }
}
