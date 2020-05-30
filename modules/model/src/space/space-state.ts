import { Schema, type, MapSchema } from '@colyseus/schema';
import { Asteroid } from './asteroid';
import { Spaceship } from './spaceship';
import { Missile } from './missile';
import EventEmitter from 'eventemitter3';
import { SpaceObject, SpaceObjects } from '.';

export class SpaceState extends Schema {
    @type({ map: Missile })
    public missiles = new MapSchema<Missile>();

    @type({ map: Asteroid })
    public asteroids = new MapSchema<Asteroid>();

    @type({ map: Spaceship })
    public spaceships = new MapSchema<Spaceship>();

    public events = new EventEmitter();

    constructor(isClient = true) {
        super();
        if (isClient) {
            this.missiles.onAdd = this.asteroids.onAdd = this.spaceships.onAdd = (so: SpaceObject) =>
                this.events.emit('add', so);
            this.missiles.onRemove = this.asteroids.onRemove = this.spaceships.onRemove = (so: SpaceObject) =>
                this.events.emit('remove', so);
            this.events.on('add', (so: SpaceObject) => (so.onChange = (changes) => this.events.emit(so.id, changes)));
        }
    }

    public get(id: string): SpaceObject | undefined {
        return this.missiles[id] || this.asteroids[id] || this.spaceships[id];
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
        yield* mapSchemaValues(this.missiles, destroyed);
        yield* mapSchemaValues(this.asteroids, destroyed);
        yield* mapSchemaValues(this.spaceships, destroyed);
    }

    private getMap<T extends keyof SpaceObjects>(typeField: T) {
        switch (typeField) {
            case 'Missile':
                return this.missiles;
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
        if (!mapSchemaClassProps.includes(id) && map[id].destroyed === destroyed) {
            yield map[id];
        }
    }
}
