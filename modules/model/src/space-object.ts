import { Schema, type } from '@colyseus/schema';
import { Vec2 } from './vec2';

export class SpaceObject extends Schema {
  @type('string')
  public id: string;
  @type(Vec2)
  public position: Vec2;
  @type(Vec2)
  public speed: Vec2 = new Vec2(0, 0);

  constructor(id: string, position: Vec2) {
    super();
    this.id = id;
    this.position = position;
  }
}
