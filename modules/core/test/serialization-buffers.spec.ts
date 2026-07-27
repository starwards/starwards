import { expect } from 'chai';
import path from 'path';

/**
 * serialization-buffers.ts pre-sizes the module-level write buffer inside @colyseus/msgpackr.
 * That only protects colyseus if both packages load the SAME module instance — a second copy in
 * the tree would keep its own (unsized, corruptible) buffer and the workaround would silently do
 * nothing. This locks the dedupe down.
 */
describe('@colyseus/msgpackr dedupe', () => {
    it('colyseus.js resolves the same @colyseus/msgpackr module that core pre-sizes', () => {
        const ours = require.resolve('@colyseus/msgpackr');
        const colyseusDir = path.dirname(require.resolve('colyseus.js/package.json'));
        const theirs = require.resolve('@colyseus/msgpackr', { paths: [colyseusDir] });
        expect(theirs).to.equal(ours);
    });
});
