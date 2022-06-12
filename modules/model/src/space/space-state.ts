import { BotOrderArg, MoveObjectsArg, RotataObjectsArg } from './space-properties';
import { MapSchema, Schema, type } from '@colyseus/schema';
import { SpaceObject, SpaceObjectBase, SpaceObjects } from '.';

import { Asteroid } from './asteroid';
import { CannonShell } from './cannon-shell';
import EventEmitter from 'eventemitter3';
import { Explosion } from './explosion';
import { Spaceship } from './spaceship';

function isSpaceObject(k: SpaceObject | undefined): k is SpaceObject {
    return !!k;
}

export class SpaceState extends Schema {
    @type({ map: CannonShell })
    public cannonShells = new MapSchema<CannonShell>();

    @type({ map: Explosion })
    public explosions = new MapSchema<Explosion>();

    @type({ map: Asteroid })
    public asteroids = new MapSchema<Asteroid>();

    @type({ map: Spaceship })
    public spaceships = new MapSchema<Spaceship>();

    // server only, used for commands
    public moveCommands = Array.of<MoveObjectsArg>();
    public rotateCommands = Array.of<RotataObjectsArg>();
    public toggleFreezeCommand = Array.of<SpaceObjectBase['id']>();
    public botOrderCommands = Array.of<BotOrderArg>();

    public events = new EventEmitter();

    constructor(isClient = true) {
        super();
        if (isClient) {
            const collections = [this.cannonShells, this.asteroids, this.spaceships, this.explosions];
            const onAdd = (so: SpaceObject) => this.events.emit('add', so);
            const onRemove = (so: SpaceObject) => this.events.emit('remove', so);
            for (const c of collections) {
                c.onAdd = onAdd;
                c.onRemove = onRemove;
            }
            this.events.on('add', (so: SpaceObject) => {
                so.onChange = (changes) => {
                    if (so.destroyed) {
                        onRemove(so);
                    }
                    for (const { field } of changes) {
                        this.events.emit(so.id, field);
                    }
                };
                so.position.onChange = (_) => this.events.emit(so.id, 'position');
                so.velocity.onChange = (_) => this.events.emit(so.id, 'velocity');
            });
        }
    }

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

    public *[Symbol.iterator](destroyed = false): IterableIterator<SpaceObject> {
        yield* mapSchemaValues(this.cannonShells, destroyed);
        yield* mapSchemaValues(this.explosions, destroyed);
        yield* mapSchemaValues(this.asteroids, destroyed);
        yield* mapSchemaValues(this.spaceships, destroyed);
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
