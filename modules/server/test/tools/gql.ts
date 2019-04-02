import { GraphQLSchema, subscribe, execute } from 'graphql';
import { expect } from 'chai';

// subscriptiosn
import { readSchema } from '../../schema/reader';
import { makeExecutableSchema } from 'graphql-tools';
// the actual resolvers
import { resolvers } from '@starwards/server';
import { Context } from 'modules/server/src/controllers/resolvers';
import { SpaceObjectsManager } from 'modules/server/src/BL/space-objects-manager';
import gql from 'graphql-tag';
import { PubSub } from 'apollo-server';

type VarsType = undefined | { [key: string]: any };
function utils(schema: () => GraphQLSchema, context: Context) {

    const execGraphQL = (query: string, vars?: VarsType) => execute(schema(), gql(query), null, context, vars);
    // utils functions for tests
    const expectQuery = async (query: string, expected: any, vars?: VarsType) =>
      expect(await execGraphQL(query, vars)).to.deep.equal(expected);
    const expectQueryResult =
    (query: string, expected: any, vars?: VarsType) => expectQuery(query, { data: expected }, vars);

    const subscribeGraphQL = <T>(query: string, vars?: VarsType) =>
      subscribe<T>(schema(), gql(query), null, context, vars);

    // TODO: continue here
    return { subscribeGraphQL, expectQuery, expectQueryResult, context };
}
type SuiteContext = ReturnType<typeof utils> & {mocha: Mocha.Suite};

function internalDescribeQL(describeFn: Mocha.ExclusiveSuiteFunction | Mocha.PendingSuiteFunction) {
  return  (title: string, body: (ctx: SuiteContext) => void) => {
    describeFn(title, function(this: Mocha.Suite) {
      // context
      let schema: GraphQLSchema;
      const context = {
        ticker : new PubSub()
      } as Context;

      before(async () => {
        // reading the actual schema
        const typeDefs = readSchema('api');
        // make the actual schema and resolvers executable
        schema = makeExecutableSchema({ typeDefs, resolvers });
      });

      beforeEach(() => {
          context.objectsManager = new SpaceObjectsManager();
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
