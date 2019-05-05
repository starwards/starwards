import { Schema, type } from '@colyseus/schema';
import { Vec2 } from './vec2';

export class SpaceObject extends Schema {
  public static compare(a: SpaceObject, b: SpaceObject): number {
    return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
  }
  @type('string')
  public id: string;
  @type(Vec2)
  public position: Vec2;
  @type('uint16')
  public radius: number;
  @type(Vec2)
  public velocity: Vec2 = new Vec2(0, 0);

  constructor(id: string, position: Vec2, radius: number) {
    super();
    this.id = id;
    this.position = position;
    this.radius = radius;
  }
}
