import {
    Faction,
    IdleStrategy,
    Projectile,
    ShipDie,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    Vec2,
    isLineOfFireBlocked,
    makeShipState,
    shipConfigurations,
} from '../src';

import { expect } from 'chai';
import { makeIterationsData } from './ship-test-harness';

/** A gravitas at the origin facing +x, its forward chain gun fuzed to detonate 5 km out. */
function shooter() {
    const spaceMgr = new SpaceManager();
    const obj = new Spaceship().init('shooter', new Vec2(0, 0), 'gravitas', Faction.Gravitas);
    const state = makeShipState(obj.id, shipConfigurations.gravitas);
    state.isPlayerShip = false;
    const mgr = new ShipManagerNpc(obj, state, spaceMgr, new ShipDie(1));
    spaceMgr.insert(obj);
    spaceMgr.forceFlushEntities();
    // the first update syncs `state` from its space object (faction, position) before any test reads it
    const [first] = makeIterationsData(0.05, 1);
    mgr.update(first);
    const [gun] = state.chainGuns;
    gun.projectile = 'HiExpShell';
    gun.shellSecondsToLive = 5000 / gun.design.bulletSpeed;
    return { spaceMgr, obj, state, mgr, gun };
}

function solid(id: string, x: number, y: number, faction: Faction, model: 'small-station' | 'dragonfly-MK1') {
    return new Spaceship().init(id, new Vec2(x, y), model, faction);
}

describe('isLineOfFireBlocked', () => {
    it('is blocked by a friendly station on the firing line', () => {
        const { state, gun } = shooter();
        const station = solid('station', 2500, 0, Faction.Gravitas, 'small-station');
        expect(isLineOfFireBlocked(state, gun, [station])).to.equal(true);
    });

    it('is clear with the friendly station beside the line, farther than its radius', () => {
        const { state, gun } = shooter();
        const station = solid('station', 2500, 600, Faction.Gravitas, 'small-station');
        expect(isLineOfFireBlocked(state, gun, [station])).to.equal(false);
    });

    it('is clear with the station beyond the detonation point', () => {
        const { state, gun } = shooter();
        const station = solid('station', 6000, 0, Faction.Gravitas, 'small-station');
        expect(isLineOfFireBlocked(state, gun, [station])).to.equal(false);
    });

    it('ignores hostile hulls, the target and the shooter itself', () => {
        const { obj, state, gun } = shooter();
        const hostile = solid('hostile', 2500, 0, Faction.Raiders, 'dragonfly-MK1');
        const friendlyTarget = solid('target', 2500, 0, Faction.Gravitas, 'dragonfly-MK1');
        expect(isLineOfFireBlocked(state, gun, [hostile, obj])).to.equal(false);
        expect(isLineOfFireBlocked(state, gun, [friendlyTarget], 'target')).to.equal(false);
    });

    it('is clear with no projectile loaded', () => {
        const { state, gun } = shooter();
        gun.projectile = 'None';
        expect(
            isLineOfFireBlocked(state, gun, [solid('station', 2500, 0, Faction.Gravitas, 'small-station')]),
        ).to.equal(false);
    });
});

describe('NPC gunnery and a friendly solid on the line', () => {
    /** An NPC gravitas attacking a play-dead dragonfly 5 km dead ahead, optionally behind a friendly station. */
    function engage(withStation: boolean) {
        const { spaceMgr, state, mgr } = shooter();
        state.idleStrategy = IdleStrategy.STAND_GROUND;
        const target = solid('target', 5000, 0, Faction.Raiders, 'dragonfly-MK1');
        const targetState = makeShipState(target.id, shipConfigurations['dragonfly-MK1']);
        targetState.isPlayerShip = false;
        targetState.idleStrategy = IdleStrategy.PLAY_DEAD;
        const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, new ShipDie(2));
        spaceMgr.insert(target);
        if (withStation) {
            const station = solid('station', 2500, 0, Faction.Gravitas, 'small-station');
            const stationState = makeShipState(station.id, shipConfigurations['small-station']);
            stationState.isPlayerShip = false;
            stationState.idleStrategy = IdleStrategy.PLAY_DEAD;
            const stationMgr = new ShipManagerNpc(station, stationState, spaceMgr, new ShipDie(3));
            spaceMgr.insert(station);
            spaceMgr.forceFlushEntities();
            spaceMgr.state.botOrderCommands.push({ ids: ['shooter'], order: { type: 'attack', targetId: 'target' } });
            return run(spaceMgr, [mgr, targetMgr, stationMgr], state);
        }
        spaceMgr.forceFlushEntities();
        spaceMgr.state.botOrderCommands.push({ ids: ['shooter'], order: { type: 'attack', targetId: 'target' } });
        return run(spaceMgr, [mgr, targetMgr], state);
    }

    function run(spaceMgr: SpaceManager, managers: ShipManagerNpc[], state: ShipManagerNpc['state']) {
        const shells = new Set<string>();
        let blockedTicks = 0;
        let firingWhileBlocked = 0;
        for (const id of makeIterationsData(10, 10 * 20)) {
            for (const mgr of managers) {
                mgr.update(id);
            }
            spaceMgr.update(id);
            const [gun] = state.chainGuns;
            if (gun.lineOfFireBlocked) {
                blockedTicks++;
                if (gun.isFiring) {
                    firingWhileBlocked++;
                }
            }
            for (const object of spaceMgr.state) {
                if (Projectile.isInstance(object) && object.shipId === 'shooter') {
                    shells.add(object.id);
                }
            }
        }
        return { shells: shells.size, blockedTicks, firingWhileBlocked };
    }

    it('holds fire while the station blocks the line', () => {
        const { shells, blockedTicks, firingWhileBlocked } = engage(true);
        expect(blockedTicks).to.be.greaterThan(0);
        expect(firingWhileBlocked).to.equal(0);
        expect(shells).to.equal(0);
    });

    it('fires with the line clear (control)', () => {
        const { shells, blockedTicks } = engage(false);
        expect(blockedTicks).to.equal(0);
        expect(shells).to.be.greaterThan(0);
    });
});
