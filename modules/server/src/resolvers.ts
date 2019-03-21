import { PositionManager } from './BL/position-manager';
import { SpaceObjectsManager } from './BL/space-objects-manager';

export interface Context {
  positionManager: PositionManager;
  objectsManager: SpaceObjectsManager;
}

export const resolvers = {
  Query: {
    allObjects: (_obj: any, _args: any, ctx: Context) =>
      ctx.objectsManager.filter(_ => true),
    objectsInRadius: (_obj: any, _args: { position: any; radius: number }, _ctx: Context) => {
      return [];
    }
  }
};
