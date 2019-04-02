import { Asteroid } from '../src/model/asteroid';
import { vec2 } from '@starwards/tsm';
import { describeGQL } from './tools/gql';
import { expect, plan } from '@starwards/test-kit';
import { isAsyncIterable } from 'iterall';
import { ExecutionResult } from 'graphql';
import { STAGE_POST_MOVE } from '../src/controllers/resolvers';
// a nice structure for test cases
// found at https://hackernoon.com/extensive-graphql-testing-57e8760f1c25

describeGQL('resolvers', ({ expectQueryResult, context, subscribeGraphQL }) => {
  beforeEach('setup objects in mongo', () => {
    context.objectsManager.addObject(new Asteroid('foo', vec2.zero));
    context.objectsManager.addObject(new Asteroid('bar', vec2.one));
  });

  it(`allObjects`, async () => {
    await expectQueryResult(
      `
    query {
      allObjects {
        id,
        position
      }
    }
  `,
      {
        allObjects: [
          { id: 'foo', position: [0, 0] },
          { id: 'bar', position: [1, 1] }
        ]
      }
    );
  });

  it(`objectsInRadius`, async () => {
    await expectQueryResult(
      `
      query Test($position : Vector!, $radius: Float!) {
        objectsInRadius(position: $position, radius: $radius) {
          id
        }
      }
    `,
      {
        objectsInRadius: [{ id: 'foo' }]
      },
      {
        position: [0, 0],
        radius: 0.5
      }
    );
  });

  it(`moveObject`, async () => {
    await expectQueryResult(
      `
      mutation Test($id: ID!, $move : Vector!) {
        moveObject(id: $id, move: $move)
      }
    `,
      {
        moveObject: [2, 24]
      },
      {
        id: 'bar',
        move: [1, 23]
      }
    );
  });

  function isAsyncIterator(obj: any): obj is AsyncIterator<any> {
    return obj && typeof obj.next === 'function' && isAsyncIterable(obj);
  }

  describe(`objectsAround`, () => {
    interface Result {
      data: {objectsAround: any[]};
    }
    let result: AsyncIterator<ExecutionResult<Result>> & AsyncIterable<ExecutionResult<Result>>;
    beforeEach(async () => {
      const response = await subscribeGraphQL<Result>(`
      subscription Test {
      objectsAround(id: "bar", radius: 0.5) {
          id,
        }
      }
      `);
      if (isAsyncIterator(response)) {
        result = response as any;
      } else if (response.errors) {
        throw new Error(`unexpected: ${response.errors}`);
      }
    });

    it (`result is finite`, plan(1, async () => {
      await context.ticker.publish(STAGE_POST_MOVE, null);
      // await context.ticker.publish(STAGE_POST_MOVE, null);

      for await (const item of result) {
        expect(item).to.eql({data: {objectsAround: [
          { id: 'foo' },
          { id: 'bar' }
        ]}});
      }
    }));
  });
});
