import { PositionManager } from '../BL/position-manager';
import { SpaceObjectsManager } from '../BL/space-objects-manager';
import { vec2 } from '@starwards/tsm';
import Vector from './vector';

export interface Context {
  positionManager: PositionManager;
  objectsManager: SpaceObjectsManager;
}

export const resolvers = {
  Query: {
    allObjects: (_obj: any, _args: any, ctx: Context) =>
      ctx.objectsManager.filter(_ => true),
    objectsInRadius: (_obj: any, args: { position: vec2; radius: number }, ctx: Context) =>
      ctx.objectsManager.filter(o =>
        vec2.distance(args.position, o.position) <= args.radius
        )
  },
  Vector
};
