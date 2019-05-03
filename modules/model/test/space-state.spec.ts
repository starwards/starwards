import { expect } from 'chai';
import 'mocha';
import { SpaceState, SpaceObject } from '@starwards/model';
import { Asteroid } from '@starwards/model';
import { Vec2 } from '@starwards/model';
import nanoid from 'nanoid';
import { Spaceship } from '@starwards/model';

const fieldSize = 80000;
const asteroidSize = 25;
const map = Array(100).fill(null).map(() => new Asteroid(
    nanoid(),
    new Vec2( Math.random() * fieldSize - fieldSize / 2, Math.random() * fieldSize - fieldSize / 2),
    Math.random() * asteroidSize
));
map.push(new Spaceship(
    nanoid(),
    new Vec2( 0, 0),
    10
));

describe('model', () => {
  describe('SpaceState', () => {
    it('iterator has same number of elements', () => {
      const uut = new SpaceState(map);
      expect([...uut].length).to.equal(map.length);
    });
    it('iterator has the same elements', () => {
        const uut = new SpaceState(map);
        expect([...uut].sort(SpaceObject.compare)).to.eql(map.sort(SpaceObject.compare));
      });
  });
});
