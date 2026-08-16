import { Projectile, ammoDesigns } from '../src';
import { expect } from 'chai';

describe('Projectile.makeExplosion — shell blast geometry (issue #2150)', () => {
    it("halves a cannon shell blast's growth speed, so its max radius is physically smaller", () => {
        const shell = new Projectile('HiExpShell');
        const design = ammoDesigns.HiExpShell.explosion;
        expect(shell.makeExplosion().expansionSpeed).to.be.closeTo(design.expansionSpeed * 0.5, 0.0001);
    });

    it('halves a Frag shell blast the same way', () => {
        const shell = new Projectile('FragShell');
        const design = ammoDesigns.FragShell.explosion;
        expect(shell.makeExplosion().expansionSpeed).to.be.closeTo(design.expansionSpeed * 0.5, 0.0001);
    });

    it('leaves missile blast geometry unchanged', () => {
        const missile = new Projectile('HiExpMissile');
        const design = ammoDesigns.HiExpMissile.explosion;
        expect(missile.makeExplosion().expansionSpeed).to.equal(design.expansionSpeed);
    });
});
