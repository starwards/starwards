import { Schema, type, MapSchema } from '@colyseus/schema';
import { Asteroid } from './asteroid';
import { Spaceship } from './spaceship';
import EventEmitter from 'eventemitter3';
import { SpaceObject, SpaceObjects } from '.';

export class SpaceState extends Schema {
    /**
     * monkey-patch to enable methods on remote copies of SpaceState.
     * need to be called explicitly from the appliction.
     * @param clientState client side state object (replication)
     */
    public static clientInit(clientState: SpaceState) {
        (['get', 'getAll', 'registerOnAdd', 'registerOnRemove', Symbol.iterator] as Array<keyof SpaceState>).forEach(
            (p) => ((clientState[p] as any) = SpaceState.prototype[p])
        );
        clientState.events = new EventEmitter();
        clientState.asteroids.onAdd = clientState.spaceships.onAdd = (so: SpaceObject) =>
            clientState.events.emit('add', so);

        clientState.asteroids.onRemove = clientState.spaceships.onRemove = (so: SpaceObject) =>
            clientState.events.emit('remove', so);

        clientState.events.on(
            'add',
            (so: SpaceObject) => (so.onChange = (changes) => clientState.events.emit(so.id, changes))
        );
    }

    @type({ map: Asteroid })
    public asteroids = new MapSchema<Asteroid>();

    @type({ map: Spaceship })
    public spaceships = new MapSchema<Spaceship>();
    public events = new EventEmitter();

    constructor() {
        super();
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
