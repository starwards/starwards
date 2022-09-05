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
        services: never;
        guards: never;
        delays: never;
    };
    eventsCausingActions: {};
    eventsCausingServices: {};
    eventsCausingGuards: {};
    eventsCausingDelays: {};
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
