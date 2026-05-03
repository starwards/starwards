import {
    AmmoType,
    ArmorType,
    HullOutcome,
    SystemDamageScope,
    SystemDamageSeverity,
    ammoTypes,
    armorTypes,
    damageMultiplierForOutcome,
    isSurfaceEffectAmmo,
    resolveHullOutcome,
    systemDamageProfile,
} from '../src/logic/damage-matrix';

import { expect } from 'chai';

describe('damage-matrix', () => {
    describe('enumerations', () => {
        it('exposes 5 armor types matching the design doc', () => {
            expect(armorTypes).to.have.members([
                'composite',
                'whipple',
                'hardened',
                'reactive',
                'faraday',
            ] as ArmorType[]);
        });
        it('exposes 8 ammo types (3 cannon + 5 missile)', () => {
            expect(armorTypes.length).to.equal(5);
            expect(ammoTypes.length).to.equal(8);
            expect(ammoTypes).to.have.members([
                'cannon-he',
                'cannon-ap',
                'cannon-frag',
                'missile-he',
                'missile-sabot',
                'missile-cluster',
                'missile-tandem',
                'missile-emp',
            ] as AmmoType[]);
        });
    });

    describe('resolveHullOutcome', () => {
        // Each row is straight from the design doc's "Hull Damage Matrix":
        //   [ammo, armor, expected outcome]
        const cases: Array<[AmmoType, ArmorType, HullOutcome]> = [
            ['cannon-he', 'composite', 'normal'],
            ['cannon-he', 'whipple', 'resist'],
            ['cannon-he', 'hardened', 'resist'],
            ['cannon-he', 'reactive', 'resist'],
            ['cannon-he', 'faraday', 'ignores'],

            ['cannon-ap', 'composite', 'normal'],
            ['cannon-ap', 'whipple', 'vulnerable'],
            ['cannon-ap', 'hardened', 'vulnerable'],
            ['cannon-ap', 'reactive', 'normal'],
            ['cannon-ap', 'faraday', 'ignores'],

            ['cannon-frag', 'composite', 'normal'],
            ['cannon-frag', 'whipple', 'resist'],
            ['cannon-frag', 'hardened', 'resist'],
            ['cannon-frag', 'reactive', 'resist'],
            ['cannon-frag', 'faraday', 'ignores'],

            ['missile-he', 'composite', 'normal'],
            ['missile-he', 'whipple', 'normal'],
            ['missile-he', 'hardened', 'resist'],
            ['missile-he', 'reactive', 'resist'],
            ['missile-he', 'faraday', 'ignores'],

            ['missile-sabot', 'composite', 'vulnerable'],
            ['missile-sabot', 'whipple', 'vulnerable'],
            ['missile-sabot', 'hardened', 'vulnerable'],
            ['missile-sabot', 'reactive', 'resist'],
            ['missile-sabot', 'faraday', 'ignores'],

            ['missile-cluster', 'composite', 'normal'],
            ['missile-cluster', 'whipple', 'resist'],
            ['missile-cluster', 'hardened', 'resist'],
            ['missile-cluster', 'reactive', 'resist'],
            ['missile-cluster', 'faraday', 'ignores'],

            ['missile-tandem', 'composite', 'vulnerable'],
            ['missile-tandem', 'whipple', 'vulnerable'],
            ['missile-tandem', 'hardened', 'normal'],
            ['missile-tandem', 'reactive', 'critical'],
            ['missile-tandem', 'faraday', 'ignores'],

            ['missile-emp', 'composite', 'ignores'],
            ['missile-emp', 'whipple', 'ignores'],
            ['missile-emp', 'hardened', 'ignores'],
            ['missile-emp', 'reactive', 'ignores'],
            ['missile-emp', 'faraday', 'resist'],
        ];

        for (const [ammo, armor, expected] of cases) {
            it(`${ammo} vs ${armor} -> ${expected}`, () => {
                expect(resolveHullOutcome(ammo, armor)).to.equal(expected);
            });
        }

        it('covers every armor x ammo combination (no holes)', () => {
            for (const ammo of ammoTypes) {
                for (const armor of armorTypes) {
                    const outcome = resolveHullOutcome(ammo, armor);
                    expect(outcome).to.be.oneOf(['resist', 'normal', 'vulnerable', 'critical', 'ignores']);
                }
            }
        });
    });

    describe('damageMultiplierForOutcome', () => {
        it('orders multipliers: ignores < resist < normal < vulnerable < critical', () => {
            const ignores = damageMultiplierForOutcome('ignores');
            const resist = damageMultiplierForOutcome('resist');
            const normal = damageMultiplierForOutcome('normal');
            const vuln = damageMultiplierForOutcome('vulnerable');
            const crit = damageMultiplierForOutcome('critical');
            expect(ignores).to.equal(0);
            expect(resist).to.be.greaterThan(0).and.lessThan(normal);
            expect(normal).to.equal(1);
            expect(vuln).to.be.greaterThan(normal);
            expect(crit).to.be.greaterThan(vuln);
        });
    });

    describe('isSurfaceEffectAmmo', () => {
        it('flags HE / Blast-Frag / Cluster as surface-effect (still scrape externals on Resist)', () => {
            expect(isSurfaceEffectAmmo('cannon-he')).to.equal(true);
            expect(isSurfaceEffectAmmo('cannon-frag')).to.equal(true);
            expect(isSurfaceEffectAmmo('missile-he')).to.equal(true);
            expect(isSurfaceEffectAmmo('missile-cluster')).to.equal(true);
        });
        it('flags penetrators / EMP as not surface-effect', () => {
            expect(isSurfaceEffectAmmo('cannon-ap')).to.equal(false);
            expect(isSurfaceEffectAmmo('missile-sabot')).to.equal(false);
            expect(isSurfaceEffectAmmo('missile-tandem')).to.equal(false);
            expect(isSurfaceEffectAmmo('missile-emp')).to.equal(false);
        });
    });

    describe('systemDamageProfile', () => {
        it('matches the design doc system-damage table', () => {
            const cases: Array<[AmmoType, SystemDamageScope, SystemDamageSeverity]> = [
                ['cannon-he', 'single-external', 'low'],
                ['cannon-ap', 'single-internal', 'medium'],
                ['cannon-frag', 'multi-external', 'low'],
                ['missile-he', 'multi-internal', 'medium'],
                ['missile-sabot', 'single-internal', 'high'],
                ['missile-cluster', 'multi-external', 'medium'],
                ['missile-tandem', 'multi-internal', 'medium'],
                ['missile-emp', 'multi-electronics', 'high'],
            ];
            for (const [ammo, scope, severity] of cases) {
                const profile = systemDamageProfile(ammo);
                expect(profile.scope, `${ammo} scope`).to.equal(scope);
                expect(profile.severity, `${ammo} severity`).to.equal(severity);
            }
        });
    });
});
