import { SpaceObjectsManager } from '../BL/space-objects-manager';
import { vec2 } from '@starwards/tsm';
import Vector from './vector';

export interface Context {
  objectsManager: SpaceObjectsManager;
}

export const resolvers = {
  Query: {
    allObjects: (_obj: any, _args: any, ctx: Context) =>
      ctx.objectsManager.filter(_ => true),
    objectsInRadius: (_obj: any, args: { position: vec2; radius: number }, ctx: Context) =>
      ctx.objectsManager.filter(o => vec2.distance(args.position, o.position) <= args.radius),
  },
  Mutation : {
    moveObject: (_obj: any, args: { id: string; move: vec2 }, ctx: Context) => {
      const object = ctx.objectsManager.get(args.id);
      return object && object.position.add(args.move);
    },
  },
  Subscription: {
    objectsAround: (_obj: any, args: { id: string; radius: number }, ctx: Context) => {
      return ctx.objectsManager.streamObjectsAround(args.id, args.radius);
    },
  },
  Vector
};
