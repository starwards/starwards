import { Vector } from './model/vector';
import { SpaceObject } from './model/space-object';
import { SpaceObjectsManager } from './space-objects-manager';

export class PositionManager {
  constructor(private objects: SpaceObjectsManager) {}

  public queryArea(lowerBound: Vector, upperBound: Vector): SpaceObject[] {
    return this.objects.filter(
      o =>
        o.position.x > lowerBound.x &&
        o.position.y > lowerBound.y &&
        o.position.x < upperBound.x &&
        o.position.y < upperBound.y
    );
  }
}
