import { join } from 'path';
import fs from 'fs';
import { makeExecutableSchema } from 'graphql-tools';
import { graphql } from 'graphql';
// the actual resolvers
import { resolvers } from '@starwards/server';
// the mock service
// import mockMovieService from './mocks/mockMovieService';
import { expect } from 'chai';

// a nice structure for test cases
// found at https://hackernoon.com/extensive-graphql-testing-57e8760f1c25
const helloTestCase = {
    id: 'All SpaceObjects (on empty)',
    query: `
      query {
        allObjects {
          id
        }
      }
    `,
    variables: { },

    // injecting the mock data service with canned responses
    context: { /* movieService: mockMovieService */ },

    // expected result
    expected: {
        data: {
          allObjects: []
        }
      }
};

describe('API calls', () => {
    // array of all test cases, just 1 for now
    const cases = [helloTestCase];
    // reading the actual schema
    const typeDefs = fs.readFileSync(join(__dirname, '../schema/api.graphql'), 'utf8');
    // make the actual schema and resolvers executable
    const schema = makeExecutableSchema({ typeDefs, resolvers });

    // running the test for each case in the cases array
    cases.forEach(obj => {
        const { id, query, variables, context, expected } = obj;

        it(`query: ${id}`, async () => {
            const result = await graphql(schema, query, null, context, variables);
            return expect(result).to.eql(expected);
        });
    });
});
