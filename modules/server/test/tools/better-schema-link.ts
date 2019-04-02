import {SchemaLink} from 'apollo-link-schema';
import { createAsyncIterator, forAwaitEach, isAsyncIterable } from 'iterall';
import { Operation, FetchResult, Observable } from 'apollo-link';
import { execute, subscribe, DocumentNode } from 'graphql';
import { getMainDefinition } from 'apollo-utilities';

// const defaultOptions: DefaultOptions = {
//   watchQuery: {
//     fetchPolicy: 'no-cache',
//     errorPolicy: 'ignore',
//   },
//   query: {
//     fetchPolicy: 'no-cache',
//     errorPolicy: 'all',
//   },
// };
// apollo = new ApolloClient({
//   defaultOptions,
//   link: new SchemaLink({schema, context: () => context}),
//   cache: new InMemoryCache()
// });

function isSubscription(query: DocumentNode): boolean {
  const main = getMainDefinition(query);
  return (
    main.kind === 'OperationDefinition' && main.operation === 'subscription'
  );
}

export class BetterSchemaLink extends SchemaLink {
    public request(operation: Operation): Observable<FetchResult> | null {
        return new Observable<FetchResult>(observer => {
          const executor: any = isSubscription(operation.query)
            ? subscribe
            : execute;

          const context =
            typeof this.context === 'function'
              ? this.context(operation)
              : this.context;

          const result = executor(
            this.schema,
            operation.query,
            this.rootValue,
            context,
            operation.variables,
            operation.operationName,
          );

          Promise.resolve(result)
            .then(data => {
              const iterable = isAsyncIterable(data)
                ? data
                : createAsyncIterator([data]);

              forAwaitEach(iterable as any, value => observer.next(value))
                .then(() => observer.complete())
                .catch(error => observer.error(error));
            })
            .catch(error => observer.error(error));
        });
      }
}
