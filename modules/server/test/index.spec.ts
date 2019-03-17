import { hello } from '@starwards/server';
import { expect } from 'chai';

describe('hello', () => {
    it('works!', () => {
        expect(hello).to.eql('world');
    });
});
