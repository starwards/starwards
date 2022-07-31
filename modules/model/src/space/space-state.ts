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
    @type({ map: CannonShell })
    public readonly cannonShells = new MapSchema<CannonShell>();

    @type({ map: Explosion })
    public readonly explosions = new MapSchema<Explosion>();

    @type({ map: Asteroid })
    public readonly asteroids = new MapSchema<Asteroid>();

    @type({ map: Spaceship })
    public readonly spaceships = new MapSchema<Spaceship>();

    // server only, used for commands
    public moveCommands = Array.of<BulkMoveArg>();
    public botOrderCommands = Array.of<BulkBotOrderArg>();

    public get(id: string): SpaceObject | undefined {
        return (
            this.cannonShells.get(id) ?? this.asteroids.get(id) ?? this.spaceships.get(id) ?? this.explosions.get(id)
        );
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
        yield this.cannonShells;
        yield this.explosions;
        yield this.asteroids;
        yield this.spaceships;
    }

    public *[Symbol.iterator](destroyed = false): IterableIterator<SpaceObject> {
        for (const map of this.maps()) {
            yield* mapSchemaValues(map, destroyed);
        }
    }

    private getMap<T extends keyof SpaceObjects>(typeField: T): MapSchema<SpaceObjects[T]> {
        switch (typeField) {
            case 'Explosion':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
                return this.explosions as MapSchema<any>;
            case 'CannonShell':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
                return this.cannonShells as MapSchema<any>;
            case 'Asteroid':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
                return this.asteroids as MapSchema<any>;
            case 'Spaceship':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
                return this.spaceships as MapSchema<any>;
            default:
                throw new Error(`unknmown type ${typeField}`);
        }
    }
}

export function* mapSchemaValues<T extends SpaceObject>(map: MapSchema<T>, destroyed = false): IterableIterator<T> {
    for (const result of map.values()) {
        if (result && result.destroyed === destroyed) {
            yield result;
        }
    }
}
