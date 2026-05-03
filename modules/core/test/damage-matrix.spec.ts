import {
    AmmoType,
    ArmorType,
    HullOutcome,
    SystemDamageScope,
    SystemDamageSeverity,
    ammoTypes,
    armorTypes,
    cannonAmmoTypes,
    damageMultiplierForOutcome,
    isCannonAmmo,
    isMissileAmmo,
    isSurfaceEffectAmmo,
    missileAmmoTypes,
    missilePerformanceStats,
    resolveHullOutcome,
    systemDamageProfile,
} from '../src/logic/damage-matrix';

import { expect } from 'chai';

describe('damage-matrix', () => {
    describe('enumerations', () => {
        it('exposes 5 armor types matching the design doc', () => {
            expect(armorTypes).to.have.members([
                'Composite',
                'Whipple',
                'Hardened',
                'Reactive',
                'Faraday',
            ] as ArmorType[]);
        });
        it('exposes 8 ammo types (3 cannon + 5 missile)', () => {
            expect(armorTypes.length).to.equal(5);
            expect(cannonAmmoTypes).to.have.members(['CannonHe', 'CannonAp', 'CannonFrag']);
            expect(missileAmmoTypes).to.have.members([
                'MissileHe',
                'MissileSabot',
                'MissileCluster',
                'MissileTandem',
                'MissileEmp',
            ]);
            expect(ammoTypes.length).to.equal(8);
        });
    });

    describe('resolveHullOutcome', () => {
        const cases: Array<[AmmoType, ArmorType, HullOutcome]> = [
            ['CannonHe', 'Composite', 'normal'],
            ['CannonHe', 'Whipple', 'resist'],
            ['CannonHe', 'Hardened', 'resist'],
            ['CannonHe', 'Reactive', 'resist'],
            ['CannonHe', 'Faraday', 'ignores'],

            ['CannonAp', 'Composite', 'normal'],
            ['CannonAp', 'Whipple', 'vulnerable'],
            ['CannonAp', 'Hardened', 'vulnerable'],
            ['CannonAp', 'Reactive', 'normal'],
            ['CannonAp', 'Faraday', 'ignores'],

            ['CannonFrag', 'Composite', 'normal'],
            ['CannonFrag', 'Whipple', 'resist'],
            ['CannonFrag', 'Hardened', 'resist'],
            ['CannonFrag', 'Reactive', 'resist'],
            ['CannonFrag', 'Faraday', 'ignores'],

            ['MissileHe', 'Composite', 'normal'],
            ['MissileHe', 'Whipple', 'normal'],
            ['MissileHe', 'Hardened', 'resist'],
            ['MissileHe', 'Reactive', 'resist'],
            ['MissileHe', 'Faraday', 'ignores'],

            ['MissileSabot', 'Composite', 'vulnerable'],
            ['MissileSabot', 'Whipple', 'vulnerable'],
            ['MissileSabot', 'Hardened', 'vulnerable'],
            ['MissileSabot', 'Reactive', 'resist'],
            ['MissileSabot', 'Faraday', 'ignores'],

            ['MissileCluster', 'Composite', 'normal'],
            ['MissileCluster', 'Whipple', 'resist'],
            ['MissileCluster', 'Hardened', 'resist'],
            ['MissileCluster', 'Reactive', 'resist'],
            ['MissileCluster', 'Faraday', 'ignores'],

            ['MissileTandem', 'Composite', 'vulnerable'],
            ['MissileTandem', 'Whipple', 'vulnerable'],
            ['MissileTandem', 'Hardened', 'normal'],
            ['MissileTandem', 'Reactive', 'critical'],
            ['MissileTandem', 'Faraday', 'ignores'],

            ['MissileEmp', 'Composite', 'ignores'],
            ['MissileEmp', 'Whipple', 'ignores'],
            ['MissileEmp', 'Hardened', 'ignores'],
            ['MissileEmp', 'Reactive', 'ignores'],
            ['MissileEmp', 'Faraday', 'resist'],
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
            expect(isSurfaceEffectAmmo('CannonHe')).to.equal(true);
            expect(isSurfaceEffectAmmo('CannonFrag')).to.equal(true);
            expect(isSurfaceEffectAmmo('MissileHe')).to.equal(true);
            expect(isSurfaceEffectAmmo('MissileCluster')).to.equal(true);
        });
        it('flags penetrators / EMP as not surface-effect', () => {
            expect(isSurfaceEffectAmmo('CannonAp')).to.equal(false);
            expect(isSurfaceEffectAmmo('MissileSabot')).to.equal(false);
            expect(isSurfaceEffectAmmo('MissileTandem')).to.equal(false);
            expect(isSurfaceEffectAmmo('MissileEmp')).to.equal(false);
        });
    });

    describe('cannon vs missile classification', () => {
        it('classifies cannon vs missile ammo correctly', () => {
            for (const ammo of cannonAmmoTypes) {
                expect(isCannonAmmo(ammo)).to.equal(true);
                expect(isMissileAmmo(ammo)).to.equal(false);
            }
            for (const ammo of missileAmmoTypes) {
                expect(isCannonAmmo(ammo)).to.equal(false);
                expect(isMissileAmmo(ammo)).to.equal(true);
            }
        });
    });

    describe('systemDamageProfile', () => {
        it('matches the design doc system-damage table', () => {
            const cases: Array<[AmmoType, SystemDamageScope, SystemDamageSeverity]> = [
                ['CannonHe', 'single-external', 'low'],
                ['CannonAp', 'single-internal', 'medium'],
                ['CannonFrag', 'multi-external', 'low'],
                ['MissileHe', 'multi-internal', 'medium'],
                ['MissileSabot', 'single-internal', 'high'],
                ['MissileCluster', 'multi-external', 'medium'],
                ['MissileTandem', 'multi-internal', 'medium'],
                ['MissileEmp', 'multi-electronics', 'high'],
            ];
            for (const [ammo, scope, severity] of cases) {
                const profile = systemDamageProfile(ammo);
                expect(profile.scope, `${ammo} scope`).to.equal(scope);
                expect(profile.severity, `${ammo} severity`).to.equal(severity);
            }
        });
    });

    describe('missilePerformanceStats', () => {
        it('matches the issue Missile Performance Stats table', () => {
            expect(missilePerformanceStats('MissileHe')).to.deep.equal({ speed: 3, range: 4, maneuver: 3 });
            expect(missilePerformanceStats('MissileSabot')).to.deep.equal({ speed: 5, range: 2, maneuver: 2 });
            expect(missilePerformanceStats('MissileCluster')).to.deep.equal({ speed: 3, range: 4, maneuver: 3 });
            expect(missilePerformanceStats('MissileTandem')).to.deep.equal({ speed: 2, range: 3, maneuver: 4 });
            expect(missilePerformanceStats('MissileEmp')).to.deep.equal({ speed: 4, range: 5, maneuver: 3 });
        });
    });
});
