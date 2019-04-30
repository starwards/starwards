import { Schema, type, MapSchema } from '@colyseus/schema';
import { SpaceObject } from './space-object';
import { Asteroid } from './asteroid';
import { Spaceship } from './spaceship';

export class SpaceState extends Schema {

    /**
     * monkey-patch to enable methods on remote copies of SpaceState.
     * need to be called explicitly from the appliction.
     * @param clientState client side state object (replication)
     */
    public static clientInit(clientState: SpaceState) {
    (['get', 'set', 'getAll', 'registerOnRemove'] as Array<keyof SpaceState>)
        .forEach(p => (clientState[p] as any) = this.prototype[p]);
    }

    @type({ map: Asteroid })
    public asteroids = new MapSchema<Asteroid>();

    @type({ map: Spaceship })
    public spaceships = new MapSchema<Spaceship>();

    constructor(map: SpaceObject[] = []) {
        super();
        map.forEach(o => this.set(o.clone()));
      }

    public get(id: string): SpaceObject | undefined {
      return this.asteroids[id] || this.spaceships[id];
    }

    public set(obj: SpaceObject) {
      if (obj instanceof Asteroid) {
        this.asteroids[obj.id] = obj;
      } else if (obj instanceof Spaceship) {
        this.spaceships[obj.id] = obj;
      }
    }

    public getAll(): SpaceObject[] {
      return ([] as SpaceObject[]).concat(
        Object.getOwnPropertyNames(this.asteroids).map(id => this.asteroids[id]),
        Object.getOwnPropertyNames(this.spaceships).map(id => this.spaceships[id])
      );
    }
    public registerOnRemove(callback: (so: SpaceObject, id: string) => void) {
      this.asteroids.onRemove = callback;
      this.spaceships.onRemove = callback;
    }
}
