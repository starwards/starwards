import { Projectile, ammoDesigns, ammoTypes, blastRadius } from '../src';

import { expect } from 'chai';

/**
 * `blastRadius` is what gunnery (the kill-zone gate, the kill-zone radius range) believes a round's
 * blast reaches; `makeExplosion` is what the round actually detonates into. They must agree, or
 * NPCs fire on misses the real blast can never cover.
 */
describe('blastRadius', () => {
    for (const ammo of ammoTypes) {
        if (ammoDesigns[ammo].delivery !== 'explosion') {
            continue;
        }
        it(`matches the reach of the explosion a ${ammo} detonates into`, () => {
            const explosion = new Projectile(ammo).makeExplosion();
            expect(blastRadius(ammo)).to.be.closeTo(explosion.secondsToLive * explosion.expansionSpeed, 1e-9);
        });
    }
});
