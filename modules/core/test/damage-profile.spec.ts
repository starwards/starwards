import {
    Explosion,
    Projectile,
    ammoDesigns,
    ammoTypes,
    damageProfiles,
    isMissileAmmo,
    isShellAmmo,
    weaponDamageTypes,
} from '../src';

import { expect } from 'chai';

const blastSize = (e: { expansionSpeed: number; secondsToLive: number }) => e.expansionSpeed * e.secondsToLive;

describe('damage profiles and projectile designs (design invariants)', () => {
    it('surface effect and surface damage factor agree', () => {
        for (const type of weaponDamageTypes) {
            const profile = damageProfiles[type];
            expect(profile.surfaceDamageFactor > 0, type).to.equal(profile.surfaceEffect);
        }
    });

    it('Frag is a shrapnel cloud: never penetrates, strongest surface shredder', () => {
        expect(damageProfiles.Frag.hitsInternal).to.equal(false);
        for (const type of weaponDamageTypes) {
            if (type === 'Frag') continue;
            expect(damageProfiles.Frag.surfaceDamageFactor).to.be.greaterThan(damageProfiles[type].surfaceDamageFactor);
        }
    });

    it('Frag is the only profile that does not hit internal systems', () => {
        for (const type of weaponDamageTypes) {
            expect(damageProfiles[type].hitsInternal, type).to.equal(type !== 'Frag');
        }
    });

    it('Tandem is a weaker ArmPen sharing its single-system scope', () => {
        expect(damageProfiles.Tandem.systemScope).to.equal(damageProfiles.ArmPen.systemScope);
        expect(damageProfiles.Tandem.systemDamageFactor).to.be.lessThan(damageProfiles.ArmPen.systemDamageFactor);
    });

    it('Elec is the only electronics-scoped profile and hits its scope hardest', () => {
        for (const type of weaponDamageTypes) {
            expect(damageProfiles[type].systemScope === 'electronics', type).to.equal(type === 'Elec');
        }
        for (const type of weaponDamageTypes) {
            if (type === 'Elec') continue;
            expect(damageProfiles.Elec.systemDamageFactor).to.be.greaterThan(damageProfiles[type].systemDamageFactor);
        }
    });

    it('Frag is the strongest surface scraper', () => {
        // scrape strength ~ explosion damageFactor x surfaceDamageFactor
        const scrape = (damageFactor: number, type: 'HiExp' | 'Frag') =>
            damageFactor * damageProfiles[type].surfaceDamageFactor;
        expect(scrape(ammoDesigns.FragShell.explosion.damageFactor, 'Frag')).to.be.greaterThan(
            scrape(ammoDesigns.HiExpShell.explosion.damageFactor, 'HiExp'),
        );
        expect(scrape(ammoDesigns.ClusterMissile.explosion.damageFactor, 'Frag')).to.be.greaterThan(
            scrape(ammoDesigns.HiExpMissile.explosion.damageFactor, 'HiExp'),
        );
    });

    it('all shells share one heat cost, all missiles another, and missiles run hotter', () => {
        const heats = (models: readonly (typeof ammoTypes)[number][]) =>
            new Set(models.map((m) => ammoDesigns[m].heatPerShot));
        const shellHeats = heats(ammoTypes.filter(isShellAmmo));
        const missileHeats = heats(ammoTypes.filter(isMissileAmmo));
        expect(shellHeats.size).to.equal(1);
        expect(missileHeats.size).to.equal(1);
        expect([...missileHeats][0]).to.be.greaterThan([...shellHeats][0]);
    });

    it('shrapnel clouds out-size any blast wave', () => {
        const fragBlasts = [ammoDesigns.FragMissile.explosion, ammoDesigns.ClusterMissile.warheads.Frag.explosion];
        for (const frag of fragBlasts) {
            expect(blastSize(frag)).to.be.greaterThan(blastSize(ammoDesigns.HiExpMissile.explosion));
        }
    });

    it('all frag warheads share the same intensity — they differ only in cloud size and linger time', () => {
        const shell = ammoDesigns.FragShell.explosion;
        const clusterFrag = ammoDesigns.ClusterMissile.warheads.Frag.explosion;
        const dedicated = ammoDesigns.FragMissile.explosion;
        expect(clusterFrag.damageFactor).to.equal(shell.damageFactor);
        expect(dedicated.damageFactor).to.equal(shell.damageFactor);
        // the dedicated missile's edge over the cluster mode is a bigger cloud that lingers longer
        expect(blastSize(dedicated)).to.be.greaterThan(blastSize(clusterFrag));
        expect(dedicated.secondsToLive).to.be.greaterThan(clusterFrag.secondsToLive);
    });

    it('projectiles propagate their damageType to their explosion', () => {
        for (const at of ammoTypes) {
            const p = new Projectile(at);
            expect(p.damageType).to.equal(ammoDesigns[at].damageType);
            if (ammoDesigns[at].delivery === 'explosion') {
                expect(p.makeExplosion().damageType).to.equal(ammoDesigns[at].damageType);
            } else {
                // impact rounds resolve as a single damage event — there is no explosion to make
                expect(() => p.makeExplosion()).to.throw();
            }
        }
    });

    it('a bare explosion carries the Collision damageType (flat-damage path)', () => {
        expect(new Explosion().damageType).to.equal('Collision');
    });

    describe('cluster missile warhead modes', () => {
        it('default damageType matches the default warhead mode', () => {
            const p = new Projectile('ClusterMissile');
            expect(p.damageType).to.equal(p.design.warheads![p.warhead].damageType);
        });

        it('Frag mode: big lingering shrapnel cloud, second only to the dedicated Frag missile', () => {
            const p = new Projectile('ClusterMissile');
            p.warhead = 'Frag';
            expect(p.damageType).to.equal('Frag');
            const explosion = p.makeExplosion();
            for (const at of ammoTypes) {
                if (at === 'ClusterMissile' || at === 'FragMissile') continue;
                const design = ammoDesigns[at];
                if (design.delivery === 'explosion') {
                    expect(blastSize(explosion)).to.be.greaterThan(blastSize(design.explosion));
                }
            }
            expect(blastSize(explosion)).to.be.lessThan(blastSize(ammoDesigns.FragMissile.explosion));
        });

        it('ArmPen mode: an impact warhead sharing its per-event numbers with the ArmPen shell', () => {
            const p = new Projectile('ClusterMissile');
            p.warhead = 'ArmPen';
            expect(p.damageType).to.equal('ArmPen');
            const clusterAP = p.warheadDesign;
            const shell = ammoDesigns.ArmPenShell;
            if (clusterAP.delivery !== 'impact' || shell.delivery !== 'impact') {
                throw new Error('cluster ArmPen mode and ArmPenShell should be impact delivery');
            }
            expect(clusterAP.damage).to.equal(shell.damage);
            expect(clusterAP.damage).to.be.lessThan(
                ammoDesigns.ArmPenMissile.delivery === 'impact' ? ammoDesigns.ArmPenMissile.damage : 0,
            );
        });

        it('warhead mode is ignored by single-warhead designs', () => {
            const p = new Projectile('HiExpMissile');
            p.warhead = 'ArmPen';
            expect(p.damageType).to.equal('HiExp');
            expect(p.makeExplosion().damageFactor).to.equal(ammoDesigns.HiExpMissile.explosion.damageFactor);
        });
    });
});
