import { Explosion, Projectile, damageProfiles, projectileDesigns, projectileModels } from '../src';

import { expect } from 'chai';

describe('damage profiles and projectile designs (regression pins)', () => {
    it('every projectile maps to its damage profile', () => {
        expect(projectileDesigns.HiExpShell.damageType).to.equal('HiExp');
        expect(projectileDesigns.HiExpMissile.damageType).to.equal('HiExp');
        expect(projectileDesigns.ArmPenShell.damageType).to.equal('ArmPen');
        expect(projectileDesigns.ArmPenMissile.damageType).to.equal('ArmPen');
        expect(projectileDesigns.FragShell.damageType).to.equal('Frag');
        expect(projectileDesigns.ClusterMissile.damageType).to.equal('Cluster');
        expect(projectileDesigns.TandemMissile.damageType).to.equal('Tandem');
        expect(projectileDesigns.ElecMissile.damageType).to.equal('Elec');
    });

    it('profile behavior data matches the #1929 design', () => {
        expect(damageProfiles.HiExp).to.deep.equal({
            surfaceEffect: true,
            systemScope: 'multi',
            hitsInternal: true,
            systemDamageFactor: 1,
        });
        expect(damageProfiles.ArmPen).to.deep.equal({
            surfaceEffect: false,
            systemScope: 'single',
            hitsInternal: true,
            systemDamageFactor: 1.5,
        });
        expect(damageProfiles.Frag).to.deep.equal({
            surfaceEffect: true,
            systemScope: 'multi',
            hitsInternal: false,
            systemDamageFactor: 0.5,
        });
        expect(damageProfiles.Cluster).to.deep.equal({
            surfaceEffect: true,
            systemScope: 'multi',
            hitsInternal: false,
            systemDamageFactor: 1,
        });
        expect(damageProfiles.Tandem).to.deep.equal({
            surfaceEffect: false,
            systemScope: 'multi',
            hitsInternal: true,
            systemDamageFactor: 1,
        });
        expect(damageProfiles.Elec).to.deep.equal({
            surfaceEffect: false,
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
            expect(p._explosion?.damageType).to.equal(projectileDesigns[model].damageType);
        }
    });

    it('a bare explosion carries no damageType (flat-damage path)', () => {
        expect(new Explosion().damageType).to.equal(null);
    });
});
