import { Asteroid } from '../src/model/asteroid';
import { vec2 } from '@starwards/tsm';
import { describeGQL, DataResult } from './tools/gql';
import { expect, plan } from '@starwards/test-kit';
describe(`server`, () => {
  describeGQL('resolvers', ({ expectQueryResult, context, subscribeResult, execGraphQL }) => {
    beforeEach('setup objectsManager state', () => {
      context.objectsManager.addObject(new Asteroid('foo', vec2.zero.copy()));
      context.objectsManager.addObject(new Asteroid('bar', vec2.one.copy()));
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

    it(`moveObject`, plan(0, async () => {
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
    }));

    describe(`objectsAround`, () => {
      interface Result {
        objectsAround: any[];
      }
      let objectsNearBar: AsyncIterableIterator<DataResult<Result>>;
      beforeEach(async () => {
        objectsNearBar = await subscribeResult<Result>(`
        subscription {
        objectsAround(id: "bar", radius: 2) {
            id,
          }
        }
        `);
      });

      it(`finite when ticker ends`, plan(1, async () => {
        context.ticker.tick();
        for await (const item of objectsNearBar) {
          expect(item).to.eql({data: {objectsAround: [
            { id: 'foo' },
            { id: 'bar' }
          ]}});
          context.ticker.end();
        }
      }));

      it (`shows only objects in range`, plan(3, async () => {
        context.ticker.tick();
        expect((await objectsNearBar.next()).value.data.objectsAround).to.eql([
          { id: 'foo' },
          { id: 'bar' }
        ]);
        await execGraphQL( `
          mutation {
            moveObject(id: "bar", move: [${vec2.one.xy}])
          }
        `);
        context.ticker.tick();
        expect((await objectsNearBar.next()).value.data.objectsAround).to.eql([
          { id: 'bar' }
        ]);
        await execGraphQL( `
          mutation {
            moveObject(id: "foo", move: [${vec2.one.xy}])
          }
        `);
        context.ticker.tick();
        expect((await objectsNearBar.next()).value.data.objectsAround).to.eql([
          { id: 'foo' },
          { id: 'bar' }
        ]);
        context.ticker.end();
      }));
    });
  });
});
