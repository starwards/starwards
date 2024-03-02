import { BulkBotOrderArg, BulkMoveArg, CreateAsteroidOrderArg, CreateSpaceshipOrderArg } from './space-commands';
import { MapSchema, Schema } from '@colyseus/schema';
import { SpaceObject, SpaceObjects, Waypoint } from '.';

import { Asteroid } from './asteroid';
import { Explosion } from './explosion';
import { Projectile } from './projectile';
import { Spaceship } from './spaceship';
import { gameField } from '../game-field';

function isSpaceObject(k: SpaceObject | undefined): k is SpaceObject {
    return !!k;
}
export class SpaceState extends Schema {
    // the names of each map is the type of the objects it contains
    // this is part of the events API
    @gameField({ map: Projectile })
    private readonly Projectile = new MapSchema<Projectile>();

    @gameField({ map: Explosion })
    private readonly Explosion = new MapSchema<Explosion>();

    @gameField({ map: Asteroid })
    private readonly Asteroid = new MapSchema<Asteroid>();

    @gameField({ map: Spaceship })
    private readonly Spaceship = new MapSchema<Spaceship>();

    @gameField({ map: Waypoint })
    private readonly Waypoint = new MapSchema<Waypoint>();

    // server only, used for commands
    public moveCommands = Array.of<BulkMoveArg>();
    public botOrderCommands = Array.of<BulkBotOrderArg>();
    public createAsteroidCommands = Array.of<CreateAsteroidOrderArg>();
    public createSpaceshipCommands = Array.of<CreateSpaceshipOrderArg>();

    public get(id: string): SpaceObject | undefined {
        return (
            this.Projectile.get(id) ??
            this.Asteroid.get(id) ??
            this.Spaceship.get(id) ??
            this.Explosion.get(id) ??
            this.Waypoint.get(id)
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
        yield this.Asteroid;
        yield this.Spaceship;
        yield this.Waypoint;
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
