import { Schema, type, MapSchema } from '@colyseus/schema';
import { Asteroid } from './asteroid';
import { Spaceship } from './spaceship';
import { CannonShell } from './cannon-shell';
import EventEmitter from 'eventemitter3';
import { SpaceObject, SpaceObjects } from '.';
import { Explosion } from './explosion';

export class SpaceState extends Schema {
    @type({ map: CannonShell })
    public cannonShells = new MapSchema<CannonShell>();

    @type({ map: Explosion })
    public explosions = new MapSchema<Explosion>();

    @type({ map: Asteroid })
    public asteroids = new MapSchema<Asteroid>();

    @type({ map: Spaceship })
    public spaceships = new MapSchema<Spaceship>();

    public events = new EventEmitter();

    constructor(isClient = true) {
        super();
        if (isClient) {
            this.cannonShells.onAdd = this.asteroids.onAdd = this.spaceships.onAdd = this.explosions.onAdd = (
                so: SpaceObject
            ) => this.events.emit('add', so);
            this.cannonShells.onRemove = this.asteroids.onRemove = this.spaceships.onRemove = this.explosions.onRemove = (
                so: SpaceObject
            ) => this.events.emit('remove', so);
            this.events.on('add', (so: SpaceObject) => (so.onChange = (changes) => this.events.emit(so.id, changes)));
        }
    }

    public get(id: string) {
        return (this.cannonShells[id] || this.asteroids[id] || this.spaceships[id] || this.explosions[id]) as
            | SpaceObject
            | undefined;
    }

    public set(obj: SpaceObject) {
        this.getMap(obj.type)[obj.id] = obj;
    }

    public delete(obj: SpaceObject) {
        delete this.getMap(obj.type)[obj.id];
    }

    public getAll<T extends keyof SpaceObjects>(typeField: T): IterableIterator<SpaceObjects[T]> {
        return mapSchemaValues(this.getMap(typeField) as MapSchema<SpaceObjects[T]>);
    }

    public *[Symbol.iterator](destroyed = false): IterableIterator<SpaceObject> {
        yield* mapSchemaValues(this.cannonShells, destroyed);
        yield* mapSchemaValues(this.explosions, destroyed);
        yield* mapSchemaValues(this.asteroids, destroyed);
        yield* mapSchemaValues(this.spaceships, destroyed);
    }

    private getMap<T extends keyof SpaceObjects>(typeField: T) {
        switch (typeField) {
            case 'Explosion':
                return this.explosions;
            case 'CannonShell':
                return this.cannonShells;
            case 'Asteroid':
                return this.asteroids;
            case 'Spaceship':
                return this.spaceships;
            default:
                throw new Error(`unknmown type ${typeField}`);
        }
    }
}

const mapSchemaClassProps = Object.getOwnPropertyNames(new MapSchema());

export function* mapSchemaValues<T>(map: MapSchema<T>, destroyed = false): IterableIterator<T> {
    for (const id of Object.getOwnPropertyNames(map)) {
        if (!mapSchemaClassProps.includes(id) && map[id] && (map[id] as SpaceObject).destroyed === destroyed) {
            yield map[id];
        }
    }
}
