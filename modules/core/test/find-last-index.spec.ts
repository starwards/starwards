import { ArraySchema } from '@colyseus/schema';
import { expect } from 'chai';
import { findLastIndex } from '../src/utils';

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

    it('guards the lib target: a native array exposes findLastIndex without going through the wrapper', () => {
        expect([1, 2, 3, 2].findLastIndex((value) => value === 2)).to.equal(3);
    });
});
