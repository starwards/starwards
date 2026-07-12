import { Explosion, Projectile, damageProfiles, projectileDesigns, projectileModels } from '../src';

import { expect } from 'chai';

describe('damage profiles and projectile designs (regression pins)', () => {
    it('every projectile maps to its damage profile', () => {
        expect(projectileDesigns.HiExpShell.damageType).to.equal('HiExp');
        expect(projectileDesigns.HiExpMissile.damageType).to.equal('HiExp');
        expect(projectileDesigns.ArmPenShell.damageType).to.equal('ArmPen');
        expect(projectileDesigns.ArmPenMissile.damageType).to.equal('ArmPen');
        expect(projectileDesigns.FragShell.damageType).to.equal('Frag');
        expect(projectileDesigns.ClusterMissile.damageType).to.equal('Frag'); // default warhead mode
        expect(projectileDesigns.TandemMissile.damageType).to.equal('Tandem');
        expect(projectileDesigns.ElecMissile.damageType).to.equal('Elec');
    });

    it('profile behavior data matches the design', () => {
        expect(damageProfiles.HiExp).to.deep.equal({
            surfaceEffect: true,
            deflectable: true,
            systemScope: 'multi',
            hitsInternal: true,
            systemDamageFactor: 1,
        });
        expect(damageProfiles.ArmPen).to.deep.equal({
            surfaceEffect: false,
            deflectable: true,
            systemScope: 'single',
            hitsInternal: true,
            systemDamageFactor: 1.5,
        });
        // shrapnel clouds cannot be deflected and never penetrate plates
        expect(damageProfiles.Frag).to.deep.equal({
            surfaceEffect: true,
            deflectable: false,
            systemScope: 'multi',
            hitsInternal: false,
            systemDamageFactor: 0.5,
        });
        expect(damageProfiles.Tandem).to.deep.equal({
            surfaceEffect: false,
            deflectable: true,
            systemScope: 'multi',
            hitsInternal: true,
            systemDamageFactor: 1,
        });
        expect(damageProfiles.Elec).to.deep.equal({
            surfaceEffect: false,
            deflectable: true,
            systemScope: 'electronics',
            hitsInternal: true,
            systemDamageFactor: 2,
        });
    });

    it('heat per shot is 5 for shells and 25 for missiles', () => {
        for (const model of projectileModels) {
            const design = projectileDesigns[model];
            expect(design.heatPerShot).to.equal(design.homing ? 25 : 5);
        }
    });

    it('projectiles propagate their damageType to their explosion', () => {
        for (const model of projectileModels) {
            const p = new Projectile(model);
            expect(p.damageType).to.equal(projectileDesigns[model].damageType);
            expect(p.makeExplosion().damageType).to.equal(projectileDesigns[model].damageType);
        }
    });

    it('a bare explosion carries no damageType (flat-damage path)', () => {
        expect(new Explosion().damageType).to.equal(null);
    });

    describe('cluster missile warhead modes', () => {
        it('Frag mode: wide shrapnel area, larger than any other blast', () => {
            const p = new Projectile('ClusterMissile');
            p.warhead = 'Frag';
            expect(p.damageType).to.equal('Frag');
            const explosion = p.makeExplosion();
            expect(explosion.blastFactor).to.equal(6);
            expect(explosion.blastFactor).to.be.greaterThan(projectileDesigns.FragShell.explosion.blastFactor);
        });

        it('ArmPen mode: small blast, still wider than a HiExp missile, weaker than a dedicated ArmPen missile', () => {
            const p = new Projectile('ClusterMissile');
            p.warhead = 'ArmPen';
            expect(p.damageType).to.equal('ArmPen');
            const explosion = p.makeExplosion();
            expect(explosion.blastFactor).to.be.greaterThan(projectileDesigns.HiExpMissile.explosion.blastFactor);
            expect(explosion.blastFactor).to.be.lessThan(p.design.warheads!.Frag.explosion.blastFactor);
            expect(explosion.damageFactor).to.be.lessThan(projectileDesigns.ArmPenMissile.explosion.damageFactor);
        });

        it('warhead mode is ignored by single-warhead designs', () => {
            const p = new Projectile('HiExpMissile');
            p.warhead = 'ArmPen';
            expect(p.damageType).to.equal('HiExp');
            expect(p.makeExplosion().damageFactor).to.equal(projectileDesigns.HiExpMissile.explosion.damageFactor);
        });
    });
});
