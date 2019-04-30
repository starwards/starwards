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
  public getObjectsAround(id: string, radius: number): SpaceObject[] {
    const subject = this.get(id);
    if (subject) {
      return this.objects.filter(o => o.position.copy().subtract(subject.position).length() < radius);
    } else {
      return [];
    }
  }
}
