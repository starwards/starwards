import { BulkBotOrderArg, BulkMoveArg } from './space-properties';
import { MapSchema, Schema, type } from '@colyseus/schema';
import { SpaceObject, SpaceObjects } from '.';

import { Asteroid } from './asteroid';
import { CannonShell } from './cannon-shell';
import { Explosion } from './explosion';
import { Spaceship } from './spaceship';

function isSpaceObject(k: SpaceObject | undefined): k is SpaceObject {
    return !!k;
}
export class SpaceState extends Schema {
    // the names of each map is the type of the objects it contains
    // this is part of the events API
    @type({ map: CannonShell })
    private readonly CannonShell = new MapSchema<CannonShell>();

    @type({ map: Explosion })
    private readonly Explosion = new MapSchema<Explosion>();

    @type({ map: Asteroid })
    private readonly Asteroid = new MapSchema<Asteroid>();

    @type({ map: Spaceship })
    private readonly Spaceship = new MapSchema<Spaceship>();

    // server only, used for commands
    public moveCommands = Array.of<BulkMoveArg>();
    public botOrderCommands = Array.of<BulkBotOrderArg>();

    public get(id: string): SpaceObject | undefined {
        return this.CannonShell.get(id) ?? this.Asteroid.get(id) ?? this.Spaceship.get(id) ?? this.Explosion.get(id);
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

    public getAll<T extends keyof SpaceObjects>(typeField: T): IterableIterator<SpaceObjects[T]> {
        return mapSchemaValues(this.getMap(typeField));
    }

    public *maps(): IterableIterator<MapSchema> {
        yield this.CannonShell;
        yield this.Explosion;
        yield this.Asteroid;
        yield this.Spaceship;
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

function* mapSchemaValues<T extends SpaceObject>(map: MapSchema<T>, destroyed = false): IterableIterator<T> {
    for (const result of map.values()) {
        if (result && result.destroyed === destroyed) {
            yield result;
        }
    }
}
