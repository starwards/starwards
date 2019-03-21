import { Vector } from './vector';

export class SpaceObject {
  constructor(public id: string, public position: Vector) {}
  get __typename() {
    return (this as any).constructor.name;
  }
}
