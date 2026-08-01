import { ArraySchema } from '@colyseus/schema';
import { expect } from 'chai';
import { findLastIndex } from '../src/utils';

/**
 * `findLastIndex` is ES2023. Colyseus delegates it to the backing array at runtime but types it as
 * `(...args: any[]) => any`, so business logic cannot call it directly without losing every type.
 * These cases pin the two things the wrapper must preserve: the native `-1` miss result, and that
 * a Colyseus collection really does answer the call.
 */
describe('findLastIndex', () => {
    it('returns the index of the last match', () => {
        expect(findLastIndex([1, 2, 3, 2], (value) => value === 2)).to.equal(3);
    });

    it('returns -1 when nothing matches', () => {
        expect(findLastIndex([1, 2, 3], (value) => value === 9)).to.equal(-1);
    });

    it('works on a Colyseus ArraySchema', () => {
        expect(findLastIndex(new ArraySchema('a', 'b', 'a'), (value) => value === 'a')).to.equal(2);
    });

    it('the toolchain exposes the ES2023 array methods natively', () => {
        expect([1, 2, 3, 2].findLastIndex((value) => value === 2)).to.equal(3);
        expect([1, 2, 3].findLast((value) => value < 3)).to.equal(2);
    });
});
