import { GraphQLSchema, subscribe, execute } from 'graphql';
import { expect } from 'chai';
import { isAsyncIterable } from 'iterall';

// subscriptiosn
import { readSchema } from '../../schema/reader';
import { makeExecutableSchema } from 'graphql-tools';
// the actual resolvers
import { Context } from 'modules/server/src/controllers/resolvers';
import { resolvers } from '@starwards/server';
import { SpaceObjectsManager } from 'modules/server/src/BL/space-objects-manager';
import gql from 'graphql-tag';
import { Ticker } from 'modules/server/src/BL/ticker';

type VarsType = undefined | { [key: string]: any };
export function isAsyncIterator(obj: any): obj is AsyncIterator<any> {
  return obj && typeof obj.next === 'function' && isAsyncIterable(obj);
}

export interface DataResult<T> {
  data: T;
}

function utils(schema: () => GraphQLSchema, context: Context) {

    const execGraphQL = (query: string, vars?: VarsType) => execute(schema(), gql(query), null, context, vars);

    const expectQuery = async (query: string, expected: any, vars?: VarsType) =>
      expect(await execGraphQL(query, vars)).to.deep.equal(expected);

    const expectQueryResult =
    (query: string, expected: any, vars?: VarsType) => expectQuery(query, { data: expected }, vars);

    const subscribeGraphQL = <T>(query: string, vars?: VarsType) =>
      subscribe<T>(schema(), gql(query), null, context, vars);

    const subscribeResult =  async <T>(query: string, vars?: VarsType)
      : Promise<AsyncIterableIterator<DataResult<T>>> => {
      const response = await subscribeGraphQL<T>(query, vars);
      if (!isAsyncIterator(response)) {
        throw new Error(`unexpected: ${response.errors}`);
      }
      return response as any;
    };

    return {execGraphQL, subscribeGraphQL, subscribeResult, expectQuery, expectQueryResult, context };
}
type SuiteContext = ReturnType<typeof utils> & {mocha: Mocha.Suite};

function internalDescribeQL(describeFn: Mocha.ExclusiveSuiteFunction | Mocha.PendingSuiteFunction) {
  return  (title: string, body: (ctx: SuiteContext) => void) => {
    describeFn(title, function(this: Mocha.Suite) {
      // context
      let schema: GraphQLSchema;
      const context = {} as Context;

      before(() => {
        // reading the actual schema
        const typeDefs = readSchema('api');
        // make the actual schema and resolvers executable
        schema = makeExecutableSchema({ typeDefs, resolvers });
      });

      beforeEach(() => {
        context.ticker = new Ticker();
        context.objectsManager = new SpaceObjectsManager();
      });

      afterEach(() => {
        context.ticker.end();
      });

      // interpret body
      body({ ...utils(() => schema, context), mocha : this});

    });
  };
}

type DescribeGQL = ReturnType<typeof internalDescribeQL>;
export const describeGQL: DescribeGQL & {only: DescribeGQL, skip: DescribeGQL} = internalDescribeQL(describe) as any;
describeGQL.only = internalDescribeQL(describe.only);
describeGQL.skip = internalDescribeQL(describe.skip);
