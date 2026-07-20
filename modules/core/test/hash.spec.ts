import { expect } from 'chai';
import { scramble } from '../src/logic/hash';

function popcount(x: number): number {
    let count = 0;
    let v = x >>> 0;
    while (v) {
        count += v & 1;
        v >>>= 1;
    }
    return count;
}

describe('scramble', () => {
    it('is deterministic', () => {
        expect(scramble(12345)).to.equal(scramble(12345));
    });

    it('avalanches: single-bit input changes flip roughly half the output bits on average', () => {
        const samples = 200;
        let totalFlippedBits = 0;
        for (let i = 0; i < samples; i++) {
            const base = (i * 2654435761) >>> 0;
            const bitToFlip = i % 32;
            const flipped = base ^ (1 << bitToFlip);
            const diff = (scramble(base) ^ scramble(flipped >>> 0)) >>> 0;
            totalFlippedBits += popcount(diff);
        }
        const avgFlippedBits = totalFlippedBits / samples;
        // 32 bits total; a good avalanche keeps the average close to 16.
        expect(avgFlippedBits).to.be.within(12, 20);
    });
});
