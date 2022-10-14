/* eslint-disable no-console */
import { createMachine, interpret } from 'xstate';

import { ErrorCode } from 'colyseus.js';
import EventEmitter from 'eventemitter3';
import { isCoded } from './errors';
import { printError } from '../utils';
import { raceEvents } from '../async-utils';

type StatusContext = { lastGameError: unknown };
const statusMachine = createMachine({
    context: { lastGameError: null } as StatusContext,
    tsTypes: {} as import('./connection-manager.typegen').Typegen0,
    predictableActionArguments: true,
    id: 'Starwards Client Status',
    initial: 'disconnected',
    states: {
        connecting: {
            after: {
                5_000: 'error.timeout',
            },
            on: {
                CONNECTED: { target: 'connected' },
                ERROR: { target: 'error' },
                DESTROY: { target: 'destroyed' },
            },
        },
        connected: {
            on: {
                DISCONNECT: { target: 'disconnected' },
                ERROR: { target: 'error' },
                DESTROY: { target: 'destroyed' },
            },
        },
        disconnected: {
            tags: ['connectable'],
            on: { CONNECT: { target: 'connecting' }, DESTROY: { target: 'destroyed' } },
        },
        error: {
            tags: ['connectable'],
            initial: 'unknown',
            states: {
                unknown: {},
                timeout: {},
            },
            on: {
                DISCONNECT: { target: 'disconnected' },
                CONNECT: { target: 'connecting' },
                DESTROY: { target: 'destroyed' },
            },
        },
        destroyed: { type: 'final', tags: ['destroyed'] },
    },
});
type StateName =
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'error'
    | 'error.timeout'
    | 'error.unknown'
    | 'destroyed';

export type ConnectionStateEvent = '*' | StateName | `exit:${StateName}`;
function isErrorLike(e: unknown): e is { message: string; stack?: string } {
    return typeof (e as Error)?.message === 'string';
}
export class ConnectionManager {
    readonly events = new EventEmitter<ConnectionStateEvent>();
    public reconnectIntervalMS = 10;
    private statusService = interpret(statusMachine)
        .start()
        .onTransition((state) => {
            if (state.changed) {
                for (const stateStr of (this.statusService.state.history?.toStrings() || []) as StateName[]) {
                    this.events.emit(`exit:${stateStr}`);
                }
                this.events.emit(`*`);
                for (const stateStr of this.statusService.state.toStrings() as StateName[]) {
                    this.events.emit(stateStr);
                }
            }
        });

    constructor(private connectJob: () => Promise<unknown>) {
        this.events.on('error', () => void setTimeout(this.connect, this.reconnectIntervalMS));
    }

    connect = () => {
        if (this.statusService.state.hasTag('connectable')) {
            this.statusService.send('CONNECT');
            void (async () => {
                try {
                    await this.connectJob();
                    this.statusService.state.context.lastGameError = null;
                    this.statusService.send('CONNECTED');
                } catch (e) {
                    if (!this.isDestroyed) {
                        this.onConnectionError(e);
                    }
                }
            })();
        }
    };
    onConnectionError = (err: unknown) => {
        if (printError(err) !== printError(this.statusService.state.context.lastGameError)) {
            console.log(`connection error: ${printError(err)}`);
        }
        if (!this.isDestroyed) {
            this.statusService.state.context.lastGameError = err;
            this.statusService.send('ERROR');
        }
    };

    destroy() {
        this.statusService.send('DESTROY');
        this.events.removeAllListeners();
    }
    get stateConnected() {
        return this.statusService.state.matches('connected');
    }

    get isDestroyed() {
        return this.statusService.state.hasTag('destroyed');
    }
    async waitForConnected() {
        if (this.stateConnected) {
            return;
        }
        if (this.isDestroyed) {
            throw new Error('client destroyed');
        }
        await raceEvents(this.events, ['connected', 'destroyed']);
        if (this.isDestroyed) {
            throw new Error('client destroyed');
        }
    }

    getErrorMessage() {
        if (!this.stateConnected) {
            const e = this.statusService.state.context.lastGameError;
            if (!e) {
                return null;
            }
            if (isCoded(e) && e.code in ErrorCode) {
                return ErrorCode[e.code];
            }
            if (e instanceof Error || isErrorLike(e)) {
                return `err: ${e.message}` + (isCoded(e) ? ` code ${e.code}` : '');
            }
            return `err: ${JSON.stringify(e)}`;
        }
        return null;
    }
    assertConnected() {
        const errorMessage = this.getErrorMessage();
        if (errorMessage) {
            throw new Error(errorMessage);
        }
    }
}
