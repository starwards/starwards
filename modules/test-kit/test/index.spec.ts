import { AssertionError } from 'chai';
import { assertNoError, expect, plantIt, NO_TESTS_GRACE, plan } from '../src';

describe('chai testkit', function () {
    const SUB_TIMEOUT = 10;

    function assertOnce() {
        expect(3).to.equal(3);
    }

    const noop = () => void 0;

    beforeEach(() => {
        assertNoError.forget();
    });
    describe('plantIt', function () {
        it('runs the test (and succeeds when 0 assertions as planned)', async function () {
            let executed = false;
            await plantIt(0, () => {
                executed = true;
            });
            await expect(executed).to.equal(true);
        });
        it('succeeds when 1 assertion as planned', async function () {
            await plantIt(1, assertOnce);
        });
        it('waits for assertion and succeeds even if assertion is after promise', async function () {
            await plantIt(1, () => {
                // this will execute after the plan finishes
                setTimeout(() => assertOnce(), SUB_TIMEOUT);
            });
        });
        it('fails when too many assertions', async function () {
            const thrown = (await plantIt(0, assertOnce).catch((e: Error) => e)) as Error;
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('1 tests done but only 0 planned');
        });
        it('fails when too few assertions', async function () {
            const thrown = (await plantIt(1, noop, 10).catch((e: Error) => e)) as Error;
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('only 0 tests done out of 1 planned');
        });
        it('waits for assertion and succeeds even if assertion is after promise', async function () {
            await plantIt(1, () => {
                // this will execute after the plan finishes
                setTimeout(() => assertOnce(), SUB_TIMEOUT);
            });
        });
        it('supports multiple serial plans', async function () {
            await plantIt(2, () => {
                assertOnce();
                assertOnce();
            });
            await plantIt(1, assertOnce);
        });
        describe('nested plans', () => {
            it('succeeds with no tests', async function () {
                await plantIt(0, async () => plantIt(0, noop));
            });
            it('succeeds with tests', async function () {
                await plantIt(2, async () => {
                    assertOnce();
                    await plantIt(1, assertOnce);
                    assertOnce();
                });
            });
            it('fails when nesting plan has too many tests', async function () {
                const thrown = (await plantIt(1, async () => {
                    assertOnce();
                    await plantIt(0, noop);
                    assertOnce();
                }).catch((e: Error) => e)) as Error;
                expect(thrown).to.be.instanceof(Error);
                expect(thrown.message).to.equal('2 tests done but only 1 planned');
            });
            it('fails when nesting plan has too few tests', async function () {
                const thrown = (await plantIt(
                    1,
                    async () => {
                        await plantIt(0, noop);
                    },
                    SUB_TIMEOUT
                ).catch((e: Error) => e)) as Error;
                expect(thrown).to.be.instanceof(Error);
                expect(thrown.message).to.equal('only 0 tests done out of 1 planned');
            });
            it('fails when nested plan has too many tests', async function () {
                const thrown = (await plantIt(0, async () => {
                    await plantIt(0, assertOnce);
                }).catch((e: Error) => e)) as Error;
                expect(thrown).to.be.instanceof(Error);
                expect(thrown.message).to.equal('1 tests done but only 0 planned');
            });
            it('fails when nested plan has too few tests', async function () {
                const thrown = (await plantIt(0, async () => {
                    await plantIt(1, noop, SUB_TIMEOUT);
                }).catch((e: Error) => e)) as Error;
                expect(thrown).to.be.instanceof(Error);
                expect(thrown.message).to.equal('only 0 tests done out of 1 planned');
            });
        });
    });
    describe('plan', function () {
        it('runs the test (and succeeds when 0 assertions as planned)', async function () {
            let executed = false;
            const thePlan = plan(0, () => {
                executed = true;
            }).bind(this);
            await thePlan();
            await expect(executed).to.equal(true);
        });
        it(
            'succeeds when 1 assertion as planned',
            plan(1, () => {
                assertOnce();
            })
        );
        it(
            'waits for assertion and succeeds even if assertion is after promise',
            plan(1, () => {
                // this will execute after the plan finishes
                setTimeout(() => assertOnce(), SUB_TIMEOUT);
            })
        );
        it('fails when too many assertions', async function () {
            const thePlan = plan(0, () => {
                assertOnce(); // the plan was for 0 tests, this should fail
            }).bind(this);
            const thrown = (await thePlan().catch((e: Error) => e)) as Error;
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('1 tests done but only 0 planned');
        });
        it('fails when too few assertions', async function () {
            const thePlan = plan(1, noop, 10).bind(this);
            const thrown = (await thePlan().catch((e: Error) => e)) as Error;
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('only 0 tests done out of 1 planned');
        });
        it('waits for too many assertions and fails even if assertion is after promise', async function () {
            const thePlan = plan(
                0,
                () => {
                    // this will execute after the plan finishes
                    setTimeout(() => assertOnce(), NO_TESTS_GRACE / 2);
                },
                10
            ).bind(this);
            const thrown = (await thePlan().catch((e: Error) => e)) as Error;
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('1 tests done but only 0 planned');
        });
        it('throws original error if assertion failed', async function () {
            const error = new Error('foo');
            const thePlan = plan(0, () => {
                throw error;
            }).bind(this);
            const thrown = await thePlan().catch((e: Error) => e);
            expect(thrown).to.equal(error);
        });
        it('assertion error has priority over plan error', async function () {
            const error = new Error('foo');
            const thePlan = plan(0, () => {
                assertOnce(); // the plan was for 0 tests, this should fail
                throw error;
            }).bind(this);
            const thrown = await thePlan().catch((e: Error) => e);
            expect(thrown).to.equal(error);
        });
    });
    describe('assertNoError', function () {
        it('does not throw when no assertion made', function () {
            expect(assertNoError).to.not.throw();
        });
        it('does not throw when no assertion error', function () {
            assertOnce();
            expect(assertNoError).to.not.throw();
        });
        it('throws original error when exists', function () {
            try {
                expect(3).equal(4);
            } catch (e) {
                noop();
            }
            expect(assertNoError).to.throw(AssertionError, 'expected 3 to equal 4');
        });
        it('does not throw after cleanup (forgets)', function () {
            try {
                expect(3).equal(4);
            } catch (e) {
                noop();
            }
            assertNoError.forget();
            expect(assertNoError).to.not.throw();
        });
        it('does not throw on second assertion (forgets on assertion)', function () {
            try {
                expect(3).equal(4);
            } catch (e) {
                noop();
            }
            try {
                assertNoError();
            } catch (e) {
                noop();
            }
            expect(assertNoError).to.not.throw();
        });
    });
});
