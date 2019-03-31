import { graphql, GraphQLSchema } from 'graphql';
import { expect } from 'chai';

// subscriptiosn
import WebSocket from 'ws';
import { WebSocketLink } from 'apollo-link-ws';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import ApolloClient, { DefaultOptions } from 'apollo-client';
import { readSchema } from '../../schema/reader';
import { makeExecutableSchema } from 'graphql-tools';
// the actual resolvers
import { resolvers } from '@starwards/server';
import { Context } from 'modules/server/src/controllers/resolvers';
import { SpaceObjectsManager } from 'modules/server/src/BL/space-objects-manager';

export function compileSchemas() {
    // reading the actual schema
     const typeDefs = readSchema('api');
    // make the actual schema and resolvers executable
     const schema = makeExecutableSchema({ typeDefs, resolvers });
     return {typeDefs, schema};
}
const GRAPHQL_ENDPOINT = 'ws://localhost:5000/subscriptions';
type VarsType = undefined | { [key: string]: any };
function utils(schema: () => GraphQLSchema, context: Context) {

    // utils functions for tests
    const expectQuery = async (query: string, expected: any, vars?: VarsType) =>
      expect(await execGraphQL(query, vars)).to.deep.equal(expected);

    const expectQueryResult =
    (query: string, expected: any, vars?: VarsType) => expectQuery(query, { data: expected }, vars);

    const execGraphQL = (query: string, vars?: VarsType) => graphql(schema(), query, null, context, vars);
    return { expectQuery, expectQueryResult, execGraphQL, context };
}
type SuiteContext = ReturnType<typeof utils> & {mocha: Mocha.Suite, client(): ApolloClient<any>};

function internalDescribeQL(describeFn: Mocha.ExclusiveSuiteFunction | Mocha.PendingSuiteFunction) {
  return  (title: string, body: (ctx: SuiteContext) => void) => {
    describeFn(title, function(this: Mocha.Suite) {
      // context
      let schema: GraphQLSchema;
      const context = {} as Context;
      let apollo: ApolloClient<any>;
      let networkInterface: SubscriptionClient;

      before(async () => {
        schema = compileSchemas().schema;
        // options to disable cache
        const defaultOptions: DefaultOptions = {
          watchQuery: {
            fetchPolicy: 'network-only',
            errorPolicy: 'ignore',
          },
          query: {
            fetchPolicy: 'network-only',
            errorPolicy: 'all',
          },
        };
        // subscriptions
        networkInterface = new SubscriptionClient(GRAPHQL_ENDPOINT, { reconnect: true }, WebSocket);
        const link = new WebSocketLink(networkInterface);
        apollo = new ApolloClient({
          defaultOptions,
          link,
          cache: new InMemoryCache()
        });
      });

      beforeEach(() => {
          context.objectsManager = new SpaceObjectsManager([]);
      });

      after(() => {
        networkInterface.close();
      });

      const client = () => apollo;

      // interpret body
      body({ ...utils(() => schema, context), client, mocha : this});

    });
  };
}

type DescribeGQL = ReturnType<typeof internalDescribeQL>;
export const describeGQL: DescribeGQL & {only: DescribeGQL, skip: DescribeGQL} = internalDescribeQL(describe) as any;
describeGQL.only = internalDescribeQL(describe.only);
describeGQL.skip = internalDescribeQL(describe.skip);
