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
        return mapSchemaValues(this.getMap(typeField));
    }

    public *maps(): IterableIterator<MapSchema> {
        yield this.Projectile;
        yield this.Explosion;
        yield this.Nebula;
        yield this.Asteroid;
        yield this.Spaceship;
        yield this.Waypoint;
        yield this.Derelict;
    }

    public *[Symbol.iterator](destroyed = false): IterableIterator<SpaceObject> {
        for (const map of this.maps()) {
            yield* mapSchemaValues(map, destroyed);
        }
    }

    private getMap<T extends keyof SpaceObjects>(typeField: T): MapSchema<SpaceObjects[T]> {
        return this[typeField] as unknown as MapSchema<SpaceObjects[T]>;
    }
}

function mapSchemaValues<T extends SpaceObject>(map: MapSchema<T>, destroyed = false): Iterable<T> {
    return {
        *[Symbol.iterator]() {
            for (const result of map.values()) {
                if (result && result.destroyed === destroyed) {
                    yield result;
                }
            }
        },
    };
}
