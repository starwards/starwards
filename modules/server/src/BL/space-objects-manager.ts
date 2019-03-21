import { SpaceObject } from './model/space-object';

export class SpaceObjectsManager {
    constructor(private objects: SpaceObject[]) {}
    public addObject(object: SpaceObject) {
        this.objects.push(object);
    }
    public filter(callbackfn: (value: SpaceObject, index: number) => any) {
        return this.objects.filter(callbackfn);
    }
}
