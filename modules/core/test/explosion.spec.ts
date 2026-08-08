import { Asteroid, Explosion, Spaceship, Vec2, isSensorInvisible } from '../src';

import { expect } from 'chai';

describe('isSensorInvisible', () => {
    it('is true for an explosion — a transient blast is not a sensor contact', () => {
        const blast = new Explosion().init('blast1', Vec2.make({ x: 0, y: 0 }), 20);
        expect(isSensorInvisible(blast)).to.equal(true);
    });

    it('is false for a ship or an asteroid — ordinary contacts stay visible', () => {
        expect(isSensorInvisible(new Spaceship())).to.equal(false);
        expect(isSensorInvisible(new Asteroid())).to.equal(false);
    });
});
