/* eslint-disable no-console */
import { createActor, setup } from 'xstate';

import { ErrorCode } from 'colyseus.js';
import EventEmitter from 'eventemitter3';
import { isCoded } from './errors';
import { printError } from '../utils';
import { raceEvents } from '../async-utils';

const statusMachine = setup({
    types: {} as {
        context: { lastGameError: unknown };
        events:
            | { type: 'CONNECT' }
            | { type: 'CONNECTED' }
            | { type: 'ERROR' }
            | { type: 'DESTROY' }
            | { type: 'DISCONNECT' };
    },
}).createMachine({
    /** @xstate-layout N4IgpgJg5mDOIC5QGUAuBDATgdyxWABAMIA2AlmAHaoFrqoCusAdAMYD2llYrqZlUAMREA8gDkxAUSIAVSQBEA2gAYAuolAAHdrDJ9OGkAA9EARgBMAGhABPM+YC+D63Rx5CpCtVoZGLDlw8fAKCkgBKYSJhKupIINq6+pSGJgjmAMymzABsAOymAJyZ2QW5AKwFymUALNZ2CAXVABzM5k0FHaam6bkdZY7OIK64mPjE5FQ0dH5snNy8-ELyksgykQCaMYYJemQGcanm5ll5hcWlFVW1tmam7cy57QXtucrPHdlOLhhuox4T3mmTFmgQWISMsF8YGY6AAZqgwJgABRlZRogCUgmG7nGXimvmBAXmwSgWziOySKUQRxO+SKphK5UqNTqiEqygeT1KbWUr3STS+Qx+IzGnkmPnohLmQUggnkAElkKIJNIZGStDpdvtQKk7ll2spssdcjymk1sqyEOkyukHuy0d1su1UZ9Bti-rjxUD-NLeLLwpFomptprKQc2VYbghHhzlOkOqUOtVygzBe7RQD8ZKfaCERA5Ss1iJNsHyaG9slwwh+pbTGV+sw4x0muU8q2ymnhTixYCCSwIGRYESZfnlVJZOr4uXtcZEM1ssx0tUegVzAUSkvzDbLRlbcpqmi0U1UY1zLlXd8sCL-niJTMB0PfXmC6sNpOKRWqQh54vl701xu1RbuklrJtUzA2gmp5tMm3Sdle3aZnewKIpg7CYHKipjqq77TpWOqICataZBykHPE8ZTHgMl6-Bmt7eswqHocI4jjmqpYaokn5VhktJnAyFzMtc9SmIaBSNvGHT7hkjTlPBtE3l6faMZgaEYcsr7FrhXEzqkNotE0y4FF0FhNKYuTCWyhScgmXQrgU-ROIMlDsBAcCGOmim9tmIY6fhs4IAAtOkFpRoF5QQYeyhHL0cbHtU8nXp63kzMOYJQL5Wr+akLa1oaC53AmTRbtUlTVKYiWIfRylpXmmVhgR36RvUS4tNUB5or0eTHgyuSVR6PZZveg61ZA9XcY16Q9BJFj5PG5kZJZVo1K0TxNG8DL9PkF5CghA1IQxTGYONumIFNtrZGU2TpGiN01NalqPOJT0OXc1TXQyCVul2+3VdmKlqcwDCUAA1i52D+R+p1WmZORXTdcZXA9UYtrkq0dEuZXPH1317XRSn-UdzB8AAtmA7AMKgJ3ZWd5pw9dt1I2UlpFGUNmlIU5lGrk6T9fjKXAm5kJoTYY1ln5X7ZJdDyXTG1QVE0mQgVGdbTaVDr8tyxwDE4QA */
    context: () => ({ lastGameError: null as unknown }),
    types: {} as {
        context: { lastGameError: unknown };
        events:
            | { type: 'CONNECT' }
            | { type: 'CONNECTED' }
            | { type: 'ERROR' }
            | { type: 'DESTROY' }
            | { type: 'DISCONNECT' };
    },
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
type StateValue = StateName | { error?: 'unknown' | 'timeout' | undefined };

export type ConnectionStateEvent = '*' | StateName | `exit:${StateName}`;
function isErrorLike(e: unknown): e is { message: string; stack?: string } {
    return typeof (e as Error)?.message === 'string';
}
function isEqual(v1: StateValue, v2: StateValue) {
    if (typeof v1 === 'object' && typeof v2 === 'object') {
        return v1.error === v2.error;
    }
    return v1 === v2;
}
function toStrings(value: StateValue): StateName[] {
    if (typeof value === 'string') {
        return [value];
    }
    if (value.error) {
        return ['error', `error.${value.error}`];
    }
    return ['error'];
}

export class ConnectionManager {
    readonly events = new EventEmitter<ConnectionStateEvent>();
    public reconnectIntervalMS = 10;
    private statusService = createActor(statusMachine).start();
    private previousSnapshot = this.statusService.getSnapshot();
    constructor(private connectJob: () => Promise<unknown>) {
        this.events.on('error', () => void setTimeout(this.connect, this.reconnectIntervalMS));
        this.statusService.subscribe((snapshot) => {
            if (!isEqual(snapshot.value, this.previousSnapshot.value)) {
                for (const stateStr of toStrings(this.previousSnapshot.value)) {
                    this.events.emit(`exit:${stateStr}`);
                }
                this.events.emit(`*`);
                for (const stateStr of toStrings(snapshot.value)) {
                    this.events.emit(stateStr);
                }
            }
            this.previousSnapshot = snapshot;
        });
    }

    connect = () => {
        if (this.statusService.getSnapshot().hasTag('connectable')) {
            this.statusService.send({ type: 'CONNECT' });
            void (async () => {
                try {
                    await this.connectJob();
                    this.statusService.getSnapshot().context.lastGameError = null;
                    this.statusService.send({ type: 'CONNECTED' });
                } catch (e) {
                    if (!this.isDestroyed) {
                        this.onConnectionError(e);
                    }
                }
            })();
        }
    };
    onConnectionError = (err: unknown) => {
        if (printError(err) !== printError(this.statusService.getSnapshot().context.lastGameError)) {
            console.log(`connection error: ${printError(err)}`);
        }
        if (!this.isDestroyed) {
            this.statusService.getSnapshot().context.lastGameError = err;
            this.statusService.send({ type: 'ERROR' });
        }
    };

    destroy() {
        this.statusService.send({ type: 'DESTROY' });
        this.statusService.stop();
        this.events.removeAllListeners();
    }
    get stateConnected() {
        return this.statusService.getSnapshot().matches('connected');
    }

    get isDestroyed() {
        return this.statusService.getSnapshot().hasTag('destroyed');
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
            let e = this.statusService.getSnapshot().context.lastGameError;
            if (!e) {
                return null;
            }
            // Handle AggregateError by extracting the first underlying error
            if (e instanceof AggregateError && e.errors.length > 0) {
                e = e.errors[0];
            }
            if (isCoded(e) && e.code in ErrorCode) {
                return ErrorCode[e.code];
            }
            if (e instanceof Error || isErrorLike(e)) {
                let message = e.message;
                let codeAppendix = '';

                if (isCoded(e)) {
                    if (message) {
                        codeAppendix = ` code ${e.code}`;
                    } else {
                        // If message is empty but error has a code, use the code as the message
                        message = e.code;
                    }
                }

                return `err: ${message}${codeAppendix}`;
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
