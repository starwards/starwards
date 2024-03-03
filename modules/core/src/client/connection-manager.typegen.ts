// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
    '@@xstate/typegen': true;
    internalEvents: {
        'xstate.after(5000)#Starwards Client Status.connecting': {
            type: 'xstate.after(5000)#Starwards Client Status.connecting';
        };
        'xstate.init': { type: 'xstate.init' };
    };
    invokeSrcNameMap: {};
    missingImplementations: {
        actions: never;
        delays: never;
        guards: never;
        services: never;
    };
    eventsCausingActions: {};
    eventsCausingDelays: {};
    eventsCausingGuards: {};
    eventsCausingServices: {};
    matchesStates:
        | 'connected'
        | 'connecting'
        | 'destroyed'
        | 'disconnected'
        | 'error'
        | 'error.timeout'
        | 'error.unknown'
        | { error?: 'timeout' | 'unknown' };
    tags: 'connectable' | 'destroyed';
}
