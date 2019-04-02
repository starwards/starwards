import { SpaceObject } from '../model/space-object';

export class SpaceObjectsManager {
  private objects: SpaceObject[] = [];
  public addObject(object: SpaceObject) {
    this.objects.push(object);
  }
  public get(id: string) {
    return this.objects.find(o => o.id === id);
  }
  public filter(callbackfn: (value: SpaceObject, index: number) => any) {
    return this.objects.filter(callbackfn);
  }
  public getObjectsAround(_id: string, _radius: number): SpaceObject[] {
    return this.objects;
  }
}
