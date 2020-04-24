import { Schema, type, MapSchema } from '@colyseus/schema';
import { Asteroid } from './asteroid';
import { Spaceship } from './spaceship';
import EventEmitter from 'eventemitter3';
import { SpaceObject, SpaceObjects } from '.';

export class SpaceState extends Schema {
    @type({ map: Asteroid })
    public asteroids = new MapSchema<Asteroid>();

    @type({ map: Spaceship })
    public spaceships = new MapSchema<Spaceship>();
    public events = new EventEmitter();

    constructor(isClient = true) {
        super();
        if (isClient) {
            this.asteroids.onAdd = this.spaceships.onAdd = (so: SpaceObject) => this.events.emit('add', so);
            this.asteroids.onRemove = this.spaceships.onRemove = (so: SpaceObject) => this.events.emit('remove', so);
            this.events.on('add', (so: SpaceObject) => (so.onChange = (changes) => this.events.emit(so.id, changes)));
        }
    }

    public get(id: string): SpaceObject | undefined {
        return this.asteroids[id] || this.spaceships[id];
    }

    public set(obj: SpaceObject) {
        this.getMap(obj.type)[obj.id] = obj;
    }

    public delete(obj: SpaceObject) {
        delete this.getMap(obj.type)[obj.id];
    }

    public getAll(): SpaceObject[] {
        return [...this];
    }

    public *[Symbol.iterator](): IterableIterator<SpaceObject> {
        yield* mapSchemaValues(this.asteroids);
        yield* mapSchemaValues(this.spaceships);
    }

    private getMap(typeField: keyof SpaceObjects) {
        switch (typeField) {
            case 'Asteroid':
                return this.asteroids;
            case 'Spaceship':
                return this.spaceships;
        }
    }
}

const mapSchemaClassProps = Object.getOwnPropertyNames(new MapSchema());

export function* mapSchemaValues<T>(map: MapSchema<T>): IterableIterator<T> {
    for (const id of Object.getOwnPropertyNames(map)) {
        if (!mapSchemaClassProps.includes(id)) {
            yield map[id];
        }
    }
}
