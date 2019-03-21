import { vec2 } from '@starwards/tsm';

export class SpaceObject {
  constructor(public id: string, public position: vec2) {}
  get __typename() {
    return (this as any).constructor.name;
  }
}
