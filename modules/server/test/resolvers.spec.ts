import { graphql } from 'graphql';
// the mock service
// import mockMovieService from './mocks/mockMovieService';
import { expect } from 'chai';
import { schema } from './tools/resolvers';
import { Asteroid } from '../src/BL/model/asteroid';
import { Vector } from '../src/BL/model/vector';

// a nice structure for test cases
// found at https://hackernoon.com/extensive-graphql-testing-57e8760f1c25

const objectsManager = [
  new Asteroid('foo', new Vector(10, -10)),
  new Asteroid('bar', new Vector(100, 100))
];
const context = {
  objectsManager
};
describe('resolvers', () => {
  it(`allObjects`, async () => {
    const query = `
      query {
        allObjects {
          id
        }
      }
    `;

    const result = await graphql(schema, query, null, context, {});
    return expect(result).to.eql({
      data: {
        allObjects: [{ id: 'foo' }, { id: 'bar' }]
      }
    });
  });
  it(`objectsInRadius`, async () => {
    const query = `
      query Test($position : VectorInput!, $radius: Float!) {
        objectsInRadius(position: $position, radius: $radius) {
          id
        }
      }
    `;
    const result = await graphql(schema, query, null, context, {position : {x: 0, y: 0}, radius : 50});
    return expect(result).to.eql({
      data: {
        objectsInRadius: [{ id: 'bar' }]
      }
    });
  });
});
