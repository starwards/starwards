import { SinonSpy, spy } from 'sinon';
import * as chai from 'chai';

export function delayedPromise(delay: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
}

export const NO_TESTS_GRACE = 20;
const DEFAULT_TIMEOUT = 2 * 1000;
const _expect: SinonSpy & typeof chai.expect = spy(chai.expect) as any;
const assert = ((chai as any).Assertion.prototype.assert = spy((chai as any).Assertion.prototype.assert));

export function assertNoError() {
    // sometimes (like when running inside expect()) the last array element is undefined
    const exceptions = assert.exceptions.filter(Boolean);
    assert.resetHistory();
    if (exceptions.length) {
        throw exceptions.pop();
    }
}

assertNoError.forget = function forget() {
    assert.resetHistory();
};
let noiseCount = 0;

function callCount() {
    return _expect.callCount - noiseCount;
}

// tslint:disable-next-line:max-line-length
export async function plantIt(
    count: number,
    testCase: (this: never) => void | Promise<any>,
    timeout?: number
): Promise<void>;
// tslint:disable-next-line:max-line-length
export async function plantIt(
    this: Mocha.Context,
    count: number,
    testCase: (this: Mocha.Context) => void | Promise<any>,
    timeout?: number
): Promise<void>;
// tslint:disable-next-line:max-line-length
export async function plantIt(
    this: Mocha.Context | never,
    count: number,
    testCase: (this: Mocha.Context | never) => void | Promise<any>,
    timeout = DEFAULT_TIMEOUT
): Promise<void> {
    const preCount = noiseCount;
    noiseCount = _expect.callCount;
    try {
        const start = Date.now();
        const waitForCount = (async () => {
            while (callCount() < count) {
                assertNoError();
                if (Date.now() - start > timeout - NO_TESTS_GRACE) {
                    throw new Error(`only ${callCount()} tests done out of ${count} planned`);
                }
                await delayedPromise(10);
            }
            assertNoError();
        })();
        await Promise.all([testCase.apply(this), waitForCount]);
        if (callCount() > count) {
            throw new Error(`${callCount()} tests done but only ${count} planned`);
        }
        await delayedPromise(NO_TESTS_GRACE);
        if (callCount() > count) {
            throw new Error(`${callCount()} tests done but only ${count} planned`);
        }
        assertNoError();
    } finally {
        noiseCount = preCount + count;
    }
}

export function plan(count: number, testCase: (this: Mocha.Context) => void | Promise<any>, timeout = DEFAULT_TIMEOUT) {
    return async function (this: Mocha.Context) {
        // this is a root-level plan
        _expect.resetHistory();
        noiseCount = 0;
        if (this) {
            this.timeout(timeout * 1000);
        } else {
            // tslint:disable-next-line:no-console
            console.warn('plan should execute in mocha context');
        }
        await plantIt.call(this, count, testCase, timeout);
    };
}

export const expect: typeof chai.expect = _expect;

export function obj(seed: any) {
    return { foo: seed } as any;
}
