import { Projectile } from '../src';
import { expect } from 'chai';

describe('Projectile.makeExplosion (issue #2150)', () => {
    it('marks the blast as a shell blast for cannon shell ammo', () => {
        const shell = new Projectile('HiExpShell');
        expect(shell.makeExplosion().isShellBlast).to.equal(true);
    });

    it('does not mark the blast as a shell blast for missile ammo', () => {
        const missile = new Projectile('HiExpMissile');
        expect(missile.makeExplosion().isShellBlast).to.equal(false);
    });
});
