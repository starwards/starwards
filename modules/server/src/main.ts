
import express from 'express';
import { ApolloServer, gql } from 'apollo-server-express';
import { resolvers } from './resolvers';
import { readFileSync } from 'fs';
import { join } from 'path';
// import bodyParser from 'body-parser';
// import schema from './src/schema';
// import movieService from './src/dataSource/movieService';

// Construct a schema, using GraphQL schema language
const typeDefs = gql(readFileSync(join(__dirname, '../schema/api.graphql'), 'utf8'));

const server = new ApolloServer({ typeDefs, resolvers });

const app = express();
server.applyMiddleware({ app });

app.listen({ port: 4000 }, () =>
  // tslint:disable-next-line:no-console
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
);

// const GRAPHQL_PORT = 3000;

// const graphQLServer = express();

// // by setting the context here, the Service is now available for Resolvers as context.movieService
// graphQLServer.use('/graphql', bodyParser.json(), graphqlExpress({ schema, context: { movieService } }));
// graphQLServer.use('/graphiql', graphiqlExpress({ endpointURL: '/graphql' }));

// graphQLServer.listen(GRAPHQL_PORT, () =>
//     // tslint:disable-next-line:no-console
//     console.log(
//         `GraphiQL is now running on http://localhost:${GRAPHQL_PORT}/graphiql`
//     )
// );
