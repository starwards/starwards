import { Asteroid } from '../src/model/asteroid';
import { vec2 } from '@starwards/tsm';
import { describeGQL } from './tools/gql';
import gql from 'graphql-tag';
// a nice structure for test cases
// found at https://hackernoon.com/extensive-graphql-testing-57e8760f1c25

describeGQL('resolvers', ({ expectQueryResult, context, client}) => {
  beforeEach('setup objects in mongo', async () => {
    context.objectsManager.addObject(new Asteroid('foo', vec2.zero));
    context.objectsManager.addObject(new Asteroid('bar', vec2.one));
  });

  it(`allObjects`, async () => {
    await expectQueryResult(`
    query {
      allObjects {
        id,
        position
      }
    }
  `, {
    allObjects: [
      { id: 'foo', position: [0, 0] },
      { id: 'bar', position: [1, 1] }
    ]
  });
  });

  it(`objectsInRadius`, async () => {
    await expectQueryResult(`
      query Test($position : Vector!, $radius: Float!) {
        objectsInRadius(position: $position, radius: $radius) {
          id
        }
      }
    `, {
      objectsInRadius: [{ id: 'foo' }]
    }, {
      position: [0, 0],
      radius: 0.5
    });
  });

  it(`moveObject`, async () => {
    await expectQueryResult(`
      mutation Test($id: ID!, $move : Vector!) {
        moveObject(id: $id, move: $move)
      }
    `, {
      moveObject: [2, 24]
    }, {
      id: 'bar',
      move: [1, 23]
    });
  });

  it(`objectsAround`, async () => {
    const query = `
      subscription Test($id: ID!, $radius : Float!) {
        objectsAround(id: $id, radius: $radius)
      }
    `;
    const vars = {
      id: 'bar',
      radius: 0.5
    };
        // SUBSCRIBE and make a promise
    const subscriptionPromise = new Promise((resolve, reject) => {
      client().subscribe({
        query: gql`
          subscription objectUpdated {
              objectUpdated(project: "game") {
                id
                property
                value
              }
          }`
      }).subscribe({
          next: resolve,
          error: reject
      });
    });

    const result = await graphql(schema, query, null, context, );

  });
});
