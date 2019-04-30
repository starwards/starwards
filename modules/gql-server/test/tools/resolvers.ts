import { readSchema } from '../../schema/reader';
import { makeExecutableSchema } from 'graphql-tools';
// the actual resolvers
import { resolvers } from '@starwards/server';

// reading the actual schema
export const typeDefs = readSchema('api');
// make the actual schema and resolvers executable
export const schema = makeExecutableSchema({ typeDefs, resolvers });
