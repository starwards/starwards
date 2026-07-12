import { Explosion, Projectile, damageProfiles, projectileDesigns, projectileModels } from '../src';

import { expect } from 'chai';

const blastSize = (e: { expansionSpeed: number; secondsToLive: number }) => e.expansionSpeed * e.secondsToLive;

describe('damage profiles and projectile designs (regression pins)', () => {
    it('every projectile maps to its damage profile', () => {
        expect(projectileDesigns.HiExpShell.damageType).to.equal('HiExp');
        expect(projectileDesigns.HiExpMissile.damageType).to.equal('HiExp');
        expect(projectileDesigns.ArmPenShell.damageType).to.equal('ArmPen');
        expect(projectileDesigns.ArmPenMissile.damageType).to.equal('ArmPen');
        expect(projectileDesigns.FragShell.damageType).to.equal('Frag');
        expect(projectileDesigns.FragMissile.damageType).to.equal('Frag');
        expect(projectileDesigns.ClusterMissile.damageType).to.equal('Frag'); // default warhead mode
        expect(projectileDesigns.TandemMissile.damageType).to.equal('Tandem');
        expect(projectileDesigns.ElecMissile.damageType).to.equal('Elec');
    });

    it('profile behavior data matches the design', () => {
        expect(damageProfiles.HiExp).to.deep.equal({
            surfaceEffect: true,
            deflectable: true,
            surfaceDamageFactor: 0.25,
            systemScope: 'multi',
            hitsInternal: true,
            systemDamageFactor: 1,
        });
        expect(damageProfiles.ArmPen).to.deep.equal({
            surfaceEffect: false,
            deflectable: true,
            surfaceDamageFactor: 0,
            systemScope: 'single',
            hitsInternal: true,
            systemDamageFactor: 1.5,
        });
        // shrapnel clouds cannot be deflected, never penetrate plates, and out-scrape any blast wave
        expect(damageProfiles.Frag).to.deep.equal({
            surfaceEffect: true,
            deflectable: false,
            surfaceDamageFactor: 2,
            systemScope: 'multi',
            hitsInternal: false,
            systemDamageFactor: 0.5,
        });
        // a slightly weaker ArmPen (single system, factor 1 vs 1.5) whose niche is defeating reactive;
        // not deflectable — the precursor defeats the deflection
        expect(damageProfiles.Tandem).to.deep.equal({
            surfaceEffect: false,
            deflectable: false,
            surfaceDamageFactor: 0,
            systemScope: 'single',
            hitsInternal: true,
            systemDamageFactor: 1,
        });
        expect(damageProfiles.Elec).to.deep.equal({
            surfaceEffect: false,
            deflectable: true,
            surfaceDamageFactor: 0,
            systemScope: 'electronics',
            hitsInternal: true,
            systemDamageFactor: 2,
        });
    });

    it('Frag is the strongest surface scraper', () => {
        // scrape strength ~ explosion damageFactor x surfaceDamageFactor
        const scrape = (damageFactor: number, type: 'HiExp' | 'Frag') =>
            damageFactor * damageProfiles[type].surfaceDamageFactor;
        expect(scrape(projectileDesigns.FragShell.explosion.damageFactor, 'Frag')).to.be.greaterThan(
            scrape(projectileDesigns.HiExpShell.explosion.damageFactor, 'HiExp'),
        );
        expect(scrape(projectileDesigns.ClusterMissile.explosion.damageFactor, 'Frag')).to.be.greaterThan(
            scrape(projectileDesigns.HiExpMissile.explosion.damageFactor, 'HiExp'),
        );
    });

    it('heat per shot is 5 for shells and 25 for missiles', () => {
        for (const model of projectileModels) {
            const design = projectileDesigns[model];
            expect(design.heatPerShot).to.equal(design.homing ? 25 : 5);
        }
    });

    it('missile blast sizes are differentiated (expansionSpeed x secondsToLive)', () => {
        expect(blastSize(projectileDesigns.ArmPenMissile.explosion)).to.equal(200);
        expect(blastSize(projectileDesigns.TandemMissile.explosion)).to.equal(300);
        expect(blastSize(projectileDesigns.ElecMissile.explosion)).to.equal(300);
        expect(blastSize(projectileDesigns.HiExpMissile.explosion)).to.equal(350);
        expect(blastSize(projectileDesigns.ClusterMissile.warheads.ArmPen.explosion)).to.equal(400);
        expect(blastSize(projectileDesigns.ClusterMissile.warheads.Frag.explosion)).to.equal(750);
        expect(blastSize(projectileDesigns.FragMissile.explosion)).to.equal(800);
    });

    it('all frag warheads share the same intensity — they differ only in cloud size and linger time', () => {
        const shell = projectileDesigns.FragShell.explosion;
        const clusterFrag = projectileDesigns.ClusterMissile.warheads.Frag.explosion;
        const dedicated = projectileDesigns.FragMissile.explosion;
        expect(shell.damageFactor).to.equal(10);
        expect(clusterFrag.damageFactor).to.equal(10);
        expect(dedicated.damageFactor).to.equal(10);
        // the dedicated missile's edge over the cluster mode is a bigger cloud that lingers longer
        expect(blastSize(dedicated)).to.be.greaterThan(blastSize(clusterFrag));
        expect(dedicated.secondsToLive).to.be.greaterThan(clusterFrag.secondsToLive);
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
        it('Frag mode: big lingering shrapnel cloud, second only to the dedicated Frag missile', () => {
            const p = new Projectile('ClusterMissile');
            p.warhead = 'Frag';
            expect(p.damageType).to.equal('Frag');
            const explosion = p.makeExplosion();
            for (const model of projectileModels) {
                if (model === 'ClusterMissile' || model === 'FragMissile') continue;
                expect(blastSize(explosion)).to.be.greaterThan(blastSize(projectileDesigns[model].explosion));
            }
            expect(blastSize(explosion)).to.be.lessThan(blastSize(projectileDesigns.FragMissile.explosion));
        });

        it('ArmPen mode: small blast, still bigger than a HiExp missile, weaker than a dedicated ArmPen missile', () => {
            const p = new Projectile('ClusterMissile');
            p.warhead = 'ArmPen';
            expect(p.damageType).to.equal('ArmPen');
            const explosion = p.makeExplosion();
            expect(blastSize(explosion)).to.be.greaterThan(blastSize(projectileDesigns.HiExpMissile.explosion));
            expect(blastSize(explosion)).to.be.lessThan(blastSize(p.design.warheads!.Frag.explosion));
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
