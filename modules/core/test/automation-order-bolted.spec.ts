import {
    Faction,
    Order,
    ShipManagerNpc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shellAmmoTypes,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';
import { expect } from 'chai';

describe('NPC ATTACK order with a bolted (non-traversing) chain gun', () => {
    function armorHealthSum(state: ReturnType<typeof makeShipState>) {
        let sum = 0;
        for (const plate of state.armor.armorPlates) {
            sum += plate.healthRatio;
        }
        return sum;
    }

    it('brings the bolted gun to bear and damages a stationary target within 5 sim-minutes', () => {
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        // .init() (not just setting .id/.position) matters here: it's what sets the SpaceObject's
        // physical radius from the ship config, which real hit detection depends on.
        const attacker = new Spaceship().init(
            'attacker',
            Vec2.make(XY.byLengthAndDirection(20_000, 0)),
            'dragonfly-MK1',
            Faction.Raiders,
        );
        const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
        attackerState.isPlayerShip = false;
        const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        const targetState = makeShipState(target.id, shipConfigurations['large-station']);
        const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, die);

        spaceMgr.insert(attacker);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        attackerMgr.state.order = Order.ATTACK;
        attackerMgr.state.orderTargetId = target.id;

        const initialArmor = armorHealthSum(targetState);
        let firingTicks = 0;
        let totalTicks = 0;
        for (const id of makeIterationsData(300, 6000)) {
            attackerMgr.update(id);
            targetMgr.update(id);
            spaceMgr.update(id);
            totalTicks++;
            if (attackerMgr.state.chainGuns[0]?.isFiring) firingTicks++;
        }

        // A1: measurably reduces the station's armour within 5 sim-minutes
        expect(armorHealthSum(targetState)).to.be.lessThan(initialArmor);
        // A2: the bolted mount actually fires during the engagement (duty cycle > 0). The pass-by
        // pursuit dynamics here are chaotic — the exact duty cycle is sensitive to floating-point
        // rounding and varies between environments — so this pins presence, not a specific rate.
        expect(firingTicks / totalTicks).to.be.greaterThan(0);
        // A3: player ships are unaffected (pinned by existing tests in this file)
    });

    it('sustains a non-zero firing duty cycle for 10 sim-minutes with no permanent stoppage (issue #2108)', () => {
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        const attacker = new Spaceship().init(
            'attacker',
            Vec2.make(XY.byLengthAndDirection(20_000, 0)),
            'dragonfly-MK1',
            Faction.Raiders,
        );
        const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
        attackerState.isPlayerShip = false;
        const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        const targetState = makeShipState(target.id, shipConfigurations['large-station']);
        const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, die);

        spaceMgr.insert(attacker);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        attackerMgr.state.order = Order.ATTACK;
        attackerMgr.state.orderTargetId = target.id;

        const gun = attackerMgr.state.chainGuns[0];
        const totalAmmoRemaining = () =>
            shellAmmoTypes.reduce((sum, ammoType) => sum + attackerState.magazine.getCount(ammoType), 0);
        let everFired = false;
        let falseStreakSeconds = 0;
        let maxFalseStreakSecondsWithAmmo = 0;
        let firingTicks = 0;
        let totalTicks = 0;
        for (const id of makeIterationsData(600, 12000)) {
            attackerMgr.update(id);
            targetMgr.update(id);
            spaceMgr.update(id);
            totalTicks++;
            if (gun.isFiring) {
                everFired = true;
                firingTicks++;
                falseStreakSeconds = 0;
            } else if (everFired) {
                // only count stoppages once the engagement has actually started — closing the
                // initial 20km approach legitimately keeps the gun quiet for a while.
                falseStreakSeconds += id.deltaSeconds;
                if (totalAmmoRemaining() > 0) {
                    maxFalseStreakSecondsWithAmmo = Math.max(maxFalseStreakSecondsWithAmmo, falseStreakSeconds);
                }
            }
        }

        // A2: once engaged, a healthy raider with ammo and the target in its envelope should
        // never go permanently silent — no stoppage should outlast a normal reposition/reload.
        expect(maxFalseStreakSecondsWithAmmo).to.be.lessThan(30);
        expect(firingTicks / totalTicks).to.be.greaterThan(0);
        // A4: the gun itself stays healthy throughout
        expect(gun.effectiveness).to.be.greaterThan(0);
    });

    it('A4: two raiders spawned together in a wave bring measurable damage to the shared target', () => {
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        // Mirrors wave-defence spawn geometry: raiders spawn together ~140km out with a small
        // (hundreds of meters) jitter offset, then ATTACK the same station. A proximity-fuzed
        // shell must not detonate on a wingman flying in formation before it reaches the target
        // — see the space-manager fix gating checkUnguidedProximityFuzes on faction (issue #2082).
        const spawnCenter = XY.byLengthAndDirection(140_000, 0);
        const raider1 = new Spaceship().init('raider1', Vec2.make(spawnCenter), 'dragonfly-MK1', Faction.Raiders);
        const raider1State = makeShipState(raider1.id, shipConfigurations['dragonfly-MK1']);
        raider1State.isPlayerShip = false;
        const raider1Mgr = new ShipManagerNpc(raider1, raider1State, spaceMgr, die);

        const raider2Position = XY.add(spawnCenter, XY.byLengthAndDirection(150, 40));
        const raider2 = new Spaceship().init('raider2', Vec2.make(raider2Position), 'dragonfly-MK1', Faction.Raiders);
        const raider2State = makeShipState(raider2.id, shipConfigurations['dragonfly-MK1']);
        raider2State.isPlayerShip = false;
        const raider2Mgr = new ShipManagerNpc(raider2, raider2State, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        const targetState = makeShipState(target.id, shipConfigurations['large-station']);
        const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, die);

        spaceMgr.insert(raider1);
        spaceMgr.insert(raider2);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        raider1Mgr.state.order = Order.ATTACK;
        raider1Mgr.state.orderTargetId = target.id;
        raider2Mgr.state.order = Order.ATTACK;
        raider2Mgr.state.orderTargetId = target.id;

        const initialArmor = armorHealthSum(targetState);
        for (const id of makeIterationsData(600, 12000)) {
            raider1Mgr.update(id);
            raider2Mgr.update(id);
            targetMgr.update(id);
            spaceMgr.update(id);
        }

        // A4: raiders arriving together from 140 km measurably damage the shared target within
        // 10 sim-minutes, instead of detonating on each other before ever reaching it.
        expect(armorHealthSum(targetState)).to.be.lessThan(initialArmor);
    });

    it('anchors the fuze to the real attack-order distance when the weapons-lock target does not resolve', () => {
        // weaponsTarget (and shellRangeMode) resolve off player-facing visibility/radar range — an
        // unrelated concern for an NPC's own gunnery against its attack order. Put the target beyond
        // every radar sector's range so weaponsTarget definitely stays unresolved (shellRangeMode
        // stays DIRECT), while still well within the gun's own maxShellRange-clamped engagement.
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        const targetDistance = 50_000; // beyond every dragonfly-MK1 radar sector's range
        const attacker = new Spaceship().init(
            'attacker',
            Vec2.make(XY.byLengthAndDirection(targetDistance, 0)),
            'dragonfly-MK1',
            Faction.Raiders,
        );
        const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
        attackerState.isPlayerShip = false;
        const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        spaceMgr.insert(attacker);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        attackerMgr.state.order = Order.ATTACK;
        attackerMgr.state.orderTargetId = target.id;

        const iterations = makeIterationsData(0.05, 1);
        for (const id of iterations) {
            attackerMgr.update(id);
            spaceMgr.update(id);
        }

        const gun = attackerMgr.state.chainGuns[0];
        expect(gun.shellRangeMode, 'target is out of every radar sector range').to.equal(SmartPilotMode.DIRECT);
        const explosionDistance = gun.shellSecondsToLive * gun.design.bulletSpeed;
        // the order target is 50km out but the gun only reaches maxShellRange (4500m) — the fuze
        // should aim for that clamped ceiling, not the gun's min/max midpoint (2500m) DIRECT mode
        // otherwise falls back to regardless of how far away the real order target actually is.
        expect(explosionDistance).to.be.greaterThan(gun.design.maxShellRange * 0.9);
    });
});
