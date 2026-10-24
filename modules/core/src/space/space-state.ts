import { ArraySchema, MapSchema, Schema } from '@colyseus/schema';
import {
    BulkBotOrderArg,
    BulkMoveArg,
    ConvertShipTypeArg,
    CreateAsteroidOrderArg,
    CreateExplosionOrderArg,
    CreateNebulaOrderArg,
    CreateSpaceshipOrderArg,
    CreateWaypointOrderArg,
    SetScanLevelArg,
} from './space-commands';
import { LockPropertyArg, Lockable } from '../lock-commands';
import { SpaceObject, SpaceObjects, Waypoint } from '.';

import { Asteroid } from './asteroid';
import { Derelict } from './derelict';
import { Explosion } from './explosion';
import { HazardCloud } from './hazard-cloud';
import { Nebula } from './nebula';
import { Projectile } from './projectile';
import { Spaceship } from './spaceship';
import { gameField } from '../game-field';

function isSpaceObject(k: SpaceObject | undefined): k is SpaceObject {
    return !!k;
}
export class SpaceState extends Schema implements Lockable {
    // the names of each map is the type of the objects it contains
    // this is part of the events API
    @gameField({ map: Projectile })
    private readonly Projectile = new MapSchema<Projectile>();

    @gameField({ map: Explosion })
    private readonly Explosion = new MapSchema<Explosion>();

    @gameField({ map: Nebula })
    private readonly Nebula = new MapSchema<Nebula>();

    @gameField({ map: HazardCloud })
    private readonly HazardCloud = new MapSchema<HazardCloud>();

    @gameField({ map: Asteroid })
    private readonly Asteroid = new MapSchema<Asteroid>();

    @gameField({ map: Spaceship })
    private readonly Spaceship = new MapSchema<Spaceship>();

    @gameField({ map: Waypoint })
    private readonly Waypoint = new MapSchema<Waypoint>();

    @gameField({ map: Derelict })
    private readonly Derelict = new MapSchema<Derelict>();

    /**
     * JSON Pointer paths (relative to this state root, e.g. `/Spaceship/ship-1/scanLevels/0`)
     * whose GM lock is currently active — see `lock-commands.ts`. Synced so the GM tweak panel's
     * lock toggle reflects current state across reconnects/other GM clients; the write guard
     * itself lives in `lock-registry.ts`.
     */
    @gameField(['string'])
    lockedPaths = new ArraySchema<string>();

    // server only, used for commands
    // commands handled by space manager:
    public moveCommands = Array.of<BulkMoveArg>();
    public botOrderCommands = Array.of<BulkBotOrderArg>();
    public createAsteroidCommands = Array.of<CreateAsteroidOrderArg>();
    public createExplosionCommands = Array.of<CreateExplosionOrderArg>();
    public createNebulaCommands = Array.of<CreateNebulaOrderArg>();
    public createWaypointCommands = Array.of<CreateWaypointOrderArg>();
    public setScanLevelCommands = Array.of<SetScanLevelArg>();
    /** Drained by `applyLockCommands` (`lock-commands.ts`) each tick. */
    public lockCommands = Array.of<LockPropertyArg>();
    // commands handled by game manager:
    public createSpaceshipCommands = Array.of<CreateSpaceshipOrderArg>();
    public destroySpaceshipCommands = Array.of<string>();
    public convertShipTypeCommands = Array.of<ConvertShipTypeArg>();

    public get(id: string): SpaceObject | undefined {
        return (
            this.Projectile.get(id) ??
            this.Asteroid.get(id) ??
            this.Spaceship.get(id) ??
            this.Explosion.get(id) ??
            this.Nebula.get(id) ??
            this.HazardCloud.get(id) ??
            this.Waypoint.get(id) ??
            this.Derelict.get(id)
        );
    }

    public getShip(id: string): Spaceship | undefined {
        return this.Spaceship.get(id);
    }

    public getBatch(ids: Array<string>): Array<SpaceObject> {
        return ids.map((id) => this.get(id)).filter<SpaceObject>(isSpaceObject);
    }

    public set(obj: SpaceObject) {
        this.getMap(obj.type).set(obj.id, obj);
    }

    public delete(obj: SpaceObject) {
        this.getMap(obj.type).delete(obj.id);
    }

    public getAll<T extends keyof SpaceObjects>(typeField: T): Iterable<SpaceObjects[T]> {
        const map = this.getMap(typeField);
        return { [Symbol.iterator]: () => new LiveObjects((i) => (i === 0 ? map : undefined), false) };
    }

    public *maps(): IterableIterator<MapSchema> {
        for (const type of ITERATION_ORDER) {
            yield this[type];
        }
    }

    /**
     * Live objects (or, with `destroyed`, only destroyed ones) in {@link ITERATION_ORDER}, then insertion
     * order. Lazy: each map is opened when reached and `destroyed` is read as each object is reached, so
     * objects inserted mid-iteration into a map not yet finished are visited. A hand-rolled iterator rather
     * than nested generators: the simulation walks the whole space several times per ship per tick.
     */
    public [Symbol.iterator](destroyed = false): IterableIterator<SpaceObject> {
        const type = (i: number) => ITERATION_ORDER[i] as (typeof ITERATION_ORDER)[number] | undefined;
        return new LiveObjects<SpaceObject>((i) => {
            const t = type(i);
            return t && (this[t] as MapSchema<SpaceObject>);
        }, destroyed);
    }

    private getMap<T extends keyof SpaceObjects>(typeField: T): MapSchema<SpaceObjects[T]> {
        return this[typeField] as unknown as MapSchema<SpaceObjects[T]>;
    }
}

const ITERATION_ORDER = [
    'Projectile',
    'Explosion',
    'Nebula',
    'HazardCloud',
    'Asteroid',
    'Spaceship',
    'Waypoint',
    'Derelict',
] as const satisfies readonly (keyof SpaceObjects)[];

class LiveObjects<T extends SpaceObject> implements IterableIterator<T> {
    private opened = 0;
    private values: IterableIterator<T> | null = null;

    /** `open(i)` is the i-th map to walk, undefined past the last. */
    constructor(
        private readonly open: (i: number) => MapSchema<T> | undefined,
        private readonly destroyed: boolean,
    ) {}

    next(): IteratorResult<T> {
        for (;;) {
            if (!this.values) {
                const map = this.open(this.opened++);
                if (!map) {
                    return { done: true, value: undefined };
                }
                this.values = map.values();
            }
            const step = this.values.next();
            if (step.done) {
                this.values = null;
            } else if (step.value && step.value.destroyed === this.destroyed) {
                return step;
            }
        }
    }

    [Symbol.iterator]() {
        return this;
    }
}
