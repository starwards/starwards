import {
    ArmorModelStats,
    Asteroid,
    AttackDamage,
    DamageManager,
    DamageType,
    Delivery,
    FRONT_ARC,
    Projectile,
    ShipArea,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    compositeArmor,
    damageProfiles,
    dragonflySF22,
    faradayArmor,
    makeShipState,
    projectileDesigns,
} from '../src';

import { MockDie } from './ship-test-harness';
import { ShipState } from '../src/ship/ship-state';
import { SpaceSimulator } from './simulator';
import { expect } from 'chai';

interface Fixture {
    ship: Spaceship;
    state: ShipState;
    spaceManager: SpaceManager;
    damageManager: DamageManager;
}

function setUpShip(armorStats: ArmorModelStats = compositeArmor): Fixture {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, dragonflySF22);
    state.armor.design.assign(armorStats);
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return { ship, state, spaceManager, damageManager };
}

function frontDamage(amount: number, damageType: DamageType, overrides: Partial<AttackDamage> = {}): AttackDamage {
    return {
        id: 'd-1',
        amount,
        damageSurfaceArc: [FRONT_ARC[0] + 1, FRONT_ARC[1] - 1],
        damageDurationSeconds: 1,
        damageType,
        profile: damageProfiles[damageType],
        ...overrides,
    };
}

function countDefectedInternals(state: ShipState): number {
    return [
        state.smartPilot.offsetFactor > 0,
        state.warp.damageFactor > 0 || state.warp.velocityFactor < 1,
        state.maneuvering.efficiency < 1,
        state.reactor.effeciencyFactor < 1 || state.reactor.energy < state.reactor.design.maxEnergy,
        state.magazine.capacity < 1 || state.magazine.getCount('HiExpShell') < state.magazine.max_HiExpShell,
    ].filter(Boolean).length;
}

describe('warhead delivery + defect mechanics (issue #1971)', () => {
    describe('warhead data (spec §8 catalog)', () => {
        const expected: Record<string, { delivery: Delivery; concentration: number; impactDamage: number }> = {
            HiExpShell: { delivery: 'explosion', concentration: 1, impactDamage: 0 },
            ArmPenShell: { delivery: 'impact', concentration: 1, impactDamage: 30 },
            FragShell: { delivery: 'explosion', concentration: 1, impactDamage: 0 },
            HiExpMissile: { delivery: 'explosion', concentration: 1, impactDamage: 0 },
            ArmPenMissile: { delivery: 'impact', concentration: 8, impactDamage: 60 },
            FragMissile: { delivery: 'explosion', concentration: 1, impactDamage: 0 },
            TandemMissile: { delivery: 'impact', concentration: 5, impactDamage: 50 },
            ElecMissile: { delivery: 'impact', concentration: 1, impactDamage: 25 },
        };
        for (const [ammo, e] of Object.entries(expected)) {
            it(`${ammo}: ${e.delivery}, concentration ${e.concentration}, damage ${e.impactDamage}`, () => {
                const d = projectileDesigns[ammo as keyof typeof projectileDesigns];
                expect(d.delivery).to.equal(e.delivery);
                expect(d.concentration).to.equal(e.concentration);
                expect(d.impactDamage).to.equal(e.impactDamage);
            });
        }

        it('Cluster Frag mode is explosion/1; AP mode is impact/3 (multi, spec §5 exception)', () => {
            const cluster = projectileDesigns.ClusterMissile;
            expect(cluster.warheads.Frag.delivery).to.equal('explosion');
            expect(cluster.warheads.Frag.concentration).to.equal(1);
            expect(cluster.warheads.ArmPen.delivery).to.equal('impact');
            expect(cluster.warheads.ArmPen.concentration).to.equal(3);
            expect(cluster.warheads.ArmPen.impactDamage).to.equal(30);
        });
    });

    describe('concentration: N defect rolls per damage event', () => {
        it('an 8-concentration hit gives its victim 8 rolls (radar +0.05 each)', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            // Elec bypasses composite plates; every roll on radar lands (MockDie rolls 0 → success)
            damageManager.takeWeaponDamage(frontDamage(1000, 'Elec', { concentration: 8 }));
            expect(state.radar.malfunctionRangeFactor).to.be.closeTo(0.4, 0.0001);
        });

        it('concentration 1 (default) gives exactly one roll', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            damageManager.takeWeaponDamage(frontDamage(1000, 'Elec', { concentration: 1 }));
            expect(state.radar.malfunctionRangeFactor).to.be.closeTo(0.05, 0.0001);
        });
    });

    describe('defect cooldown (explosion delivery only)', () => {
        it('a system takes at most one application per 0.15s window under explosion delivery', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            damageManager.takeWeaponDamage(frontDamage(1000, 'Elec', { id: 'd-1', delivery: 'explosion' }));
            expect(state.radar.malfunctionRangeFactor).to.be.closeTo(0.05, 0.0001);
            // second event, same tick: within the cooldown window → ignored
            damageManager.takeWeaponDamage(frontDamage(1000, 'Elec', { id: 'd-2', delivery: 'explosion' }));
            expect(state.radar.malfunctionRangeFactor).to.be.closeTo(0.05, 0.0001);
            // advance game time past the window, then a third event lands
            damageManager.update(0.2);
            damageManager.takeWeaponDamage(frontDamage(1000, 'Elec', { id: 'd-3', delivery: 'explosion' }));
            expect(state.radar.malfunctionRangeFactor).to.be.closeTo(0.1, 0.0001);
        });

        it('impact delivery has no cooldown — back-to-back events both land', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            damageManager.takeWeaponDamage(frontDamage(1000, 'Elec', { id: 'd-1', delivery: 'impact' }));
            damageManager.takeWeaponDamage(frontDamage(1000, 'Elec', { id: 'd-2', delivery: 'impact' }));
            expect(state.radar.malfunctionRangeFactor).to.be.closeTo(0.1, 0.0001);
        });
    });

    describe('Cluster-AP multi-scope override (spec §5 exception)', () => {
        it('an ArmPen round with a multi scope override defects every internal in the area — no sticky victim', () => {
            const { state, damageManager } = setUpShip(faradayArmor);
            // faraday is transparent to ArmPen → full exposure. The multi override makes the
            // carrier's bomblets pepper every internal in the struck area (not one sticky victim).
            damageManager.takeWeaponDamage(
                frontDamage(1000, 'ArmPen', { id: 'ap', delivery: 'impact', concentration: 1, scopeOverride: 'multi' }),
            );
            expect(countDefectedInternals(state)).to.be.greaterThan(1);
        });

        it('without the override, the same ArmPen round is single-scope: exactly one victim', () => {
            const { state, damageManager } = setUpShip(faradayArmor);
            damageManager.takeWeaponDamage(
                frontDamage(1000, 'ArmPen', { id: 'ap', delivery: 'impact', concentration: 1 }),
            );
            expect(countDefectedInternals(state)).to.equal(1);
        });
    });

    describe('sticky victim (single scope)', () => {
        it('every concentration roll lands on one system, and remaining rolls dissipate once it breaks', () => {
            const { state, damageManager } = setUpShip(faradayArmor);
            // faraday is transparent to ArmPen → full exposure; single scope picks one internal victim
            const victim = (state.systemsByAreas(ShipArea.front) || []).find((s) => s.isInternal);
            damageManager.takeWeaponDamage(
                frontDamage(1000, 'ArmPen', { id: 'd-1', delivery: 'impact', concentration: 1000 }),
            );
            expect(countDefectedInternals(state)).to.equal(1);
            expect(victim?.broken).to.equal(true);
            // a second full-concentration barrage on the already-broken victim dissipates entirely —
            // rolls never retarget another system
            damageManager.takeWeaponDamage(
                frontDamage(1000, 'ArmPen', { id: 'd-2', delivery: 'impact', concentration: 1000 }),
            );
            expect(countDefectedInternals(state)).to.equal(1);
        });
    });
});

describe('warhead delivery in the space simulation (issue #1971)', () => {
    function launchAt(target: Spaceship, model: 'ArmPenMissile' | 'HiExpMissile') {
        const projectile = new Projectile(model);
        const speed = 1000;
        const start = XY.add(target.position, XY.byLengthAndDirection(target.radius + speed, 0));
        projectile.velocity = Vec2.make(XY.byLengthAndDirection(speed, 180));
        projectile.secondsToLive = 5;
        projectile.init('proj', Vec2.make(start));
        return projectile;
    }

    it('impact delivery: contact emits one impact damage event, no explosion object', () => {
        const target = new Spaceship();
        target.id = 'target';
        const projectile = launchAt(target, 'ArmPenMissile');
        const sim = new SpaceSimulator(20).withObjects(target, projectile);
        sim.simulateUntilCondition(() => projectile.destroyed);
        const explosions = [...sim.spaceMgr.state.getAll('Explosion')];
        expect(explosions.length).to.equal(0);
        const damages = [...sim.spaceMgr.resolveObjectDamage('target')];
        expect(damages.length).to.equal(1);
        expect(damages[0].delivery).to.equal('impact');
        expect(damages[0].amount).to.equal(60);
        expect(damages[0].concentration).to.equal(8);
    });

    it('impact delivery vs a non-ship target: plain health subtraction, no explosion', () => {
        const target = new Asteroid();
        target.radius = Spaceship.radius;
        target.init('rock', Vec2.make(XY.zero));
        const before = target.health;
        const projectile = new Projectile('ArmPenMissile');
        const speed = 1000;
        const start = XY.add(target.position, XY.byLengthAndDirection(target.radius + speed, 0));
        projectile.velocity = Vec2.make(XY.byLengthAndDirection(speed, 180));
        projectile.secondsToLive = 5;
        projectile.init('proj', Vec2.make(start));
        const sim = new SpaceSimulator(20).withObjects(target, projectile);
        sim.simulateUntilCondition(() => projectile.destroyed);
        expect([...sim.spaceMgr.state.getAll('Explosion')].length).to.equal(0);
        expect(target.health).to.equal(before - 60);
    });

    it('explosion delivery: contact still detonates into an explosion object', () => {
        const target = new Spaceship();
        target.id = 'target';
        const projectile = launchAt(target, 'HiExpMissile');
        const sim = new SpaceSimulator(20).withObjects(target, projectile);
        sim.simulateUntilCondition(() => [...sim.spaceMgr.state.getAll('Explosion')].length > 0);
        expect([...sim.spaceMgr.state.getAll('Explosion')].length).to.be.greaterThan(0);
    });
});
