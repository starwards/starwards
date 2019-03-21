import { SpaceObject } from '../model/space-object';
import { SpaceObjectsManager } from './space-objects-manager';
import { vec2 } from '@starwards/tsm/src';

export class PositionManager {
  constructor(private objects: SpaceObjectsManager) {}

  public queryArea(lowerBound: vec2, upperBound: vec2): SpaceObject[] {
    return this.objects.filter(
      o =>
        o.position.x > lowerBound.x &&
        o.position.y > lowerBound.y &&
        o.position.x < upperBound.x &&
        o.position.y < upperBound.y
    );
  }
}
