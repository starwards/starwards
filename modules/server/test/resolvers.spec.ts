import { graphql } from 'graphql';
// the mock service
// import mockMovieService from './mocks/mockMovieService';
import { expect } from 'chai';
import { schema } from './tools/resolvers';
import { Asteroid } from '../src/model/asteroid';
import { vec2 } from '@starwards/tsm';
import { SpaceObjectsManager } from '../src/BL/space-objects-manager';
// a nice structure for test cases
// found at https://hackernoon.com/extensive-graphql-testing-57e8760f1c25

const objects = [
  new Asteroid('foo', vec2.zero),
  new Asteroid('bar', vec2.one)
];
const objectsManager = new SpaceObjectsManager(objects);
const context = {
  objectsManager
};
describe('resolvers', () => {
  it(`allObjects`, async () => {
    const query = `
      query {
        allObjects {
          id,
          position
        }
      }
    `;

    const result = await graphql(schema, query, null, context, {});
    return expect(result).to.eql({
      data: {
        allObjects: [
          { id: 'foo', position: [0, 0] },
          { id: 'bar', position: [1, 1] }
        ]
      }
    });
  });
  it(`objectsInRadius`, async () => {
    const query = `
      query Test($position : Vector!, $radius: Float!) {
        objectsInRadius(position: $position, radius: $radius) {
          id
        }
      }
    `;
    const result = await graphql(schema, query, null, context, {
      position: [0, 0],
      radius: 0.5
    });
    return expect(result).to.eql({
      data: {
        objectsInRadius: [{ id: 'foo' }]
      }
    });
  });
  it(`moveObject`, async () => {
    const query = `
      mutation Test($id: ID!, $move : Vector!) {
        moveObject(id: $id, move: $move)
      }
    `;
    const result = await graphql(schema, query, null, context, {
      id: 'bar',
      move: [1, 23]
    });
    return expect(result).to.eql({
      data: {
        moveObject: [2, 24]
      }
    });
  });
});
