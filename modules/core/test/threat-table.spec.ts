import {
    Explosion,
    Faction,
    IdleStrategy,
    Order,
    ShipDie,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    ThreatTable,
    Vec2,
    XY,
    aggroCharacters,
    makeShipState,
    shipConfigurations,
    withSpawnNoise,
} from '../src';

import { expect } from 'chai';
import { makeIterationsData } from './ship-test-harness';

const never = () => false;

function brawler() {
    const table = new ThreatTable();
    table.character = aggroCharacters.Brawler;
    return table;
}

describe('ThreatTable', () => {
    it('a Brawler turns on an attacker whose damage beats the mission by the switch margin', () => {
        const table = brawler();
        const { missionWeight, switchMargin } = aggroCharacters.Brawler;
        table.add('a', missionWeight * (1 + switchMargin) * 0.9);
        table.update(0.05, [], never);
        expect(table.heldId, 'inside the margin').to.equal(null);
        table.add('a', missionWeight);
        table.update(0.05, [], never);
        expect(table.heldId).to.equal('a');
    });

    it('drifts back to the mission once the grudge decays, with no further damage', () => {
        const table = brawler();
        table.add('a', aggroCharacters.Brawler.missionWeight * 2);
        table.update(0.05, [], never);
        expect(table.heldId).to.equal('a');
        let seconds = 0;
        while (table.heldId !== null && seconds < 300) {
            table.update(0.05, [], never);
            seconds += 0.05;
        }
        expect(table.heldId).to.equal(null);
        // memory x ln(peak / (missionWeight / (1 + margin))) = 20 x ln(2.5) ~ 18 s
        expect(seconds).to.be.within(15, 22);
        expect(table.switches).to.equal(2);
    });

    it('a challenger inside the margin never steals attention from the held attacker', () => {
        const table = brawler();
        table.add('a', 1000);
        table.update(0.05, [], never);
        table.add('b', 1100);
        table.update(0.05, [], never);
        expect(table.heldId).to.equal('a');
        table.add('b', 300);
        table.update(0.05, [], never);
        expect(table.heldId).to.equal('b');
    });

    it('Fixated never leaves its mission', () => {
        const table = new ThreatTable();
        table.character = aggroCharacters.Fixated;
        table.add('a', 1e9);
        table.update(0.05, [], never);
        expect(table.heldId).to.equal(null);
    });

    it('a Hunter builds a grudge against a hostile merely in reach', () => {
        const table = new ThreatTable();
        table.character = aggroCharacters.Hunter;
        for (let seconds = 0; seconds < 60 && table.heldId === null; seconds += 0.05) {
            table.update(0.05, ['a'], never);
        }
        expect(table.heldId).to.equal('a');
    });

    it('forgets an attacker that is gone and returns to mission', () => {
        const table = brawler();
        table.add('a', 1000);
        table.update(0.05, [], never);
        table.update(0.05, [], (id) => id === 'a');
        expect(table.heldId).to.equal(null);
    });

    it('spawn noise stays within ±10% and leaves an infinite mission alone', () => {
        const noisy = withSpawnNoise(aggroCharacters.Brawler, () => 1);
        expect(noisy.missionWeight).to.be.closeTo(aggroCharacters.Brawler.missionWeight * 1.1, 1e-9);
        expect(noisy.presenceRate).to.equal(aggroCharacters.Brawler.presenceRate);
        expect(withSpawnNoise(aggroCharacters.Fixated, () => 0).missionWeight).to.equal(Infinity);
    });
});

describe('aggro on an NPC attacking a station', () => {
    function scene(character: keyof typeof aggroCharacters) {
        const spaceMgr = new SpaceManager();
        const make = (
            id: string,
            position: XY,
            model: 'small-station' | 'gravitas' | 'dragonfly-MK1',
            faction: Faction,
            seed: number,
        ) => {
            const obj = new Spaceship().init(id, Vec2.make(position), model, faction);
            const state = makeShipState(obj.id, shipConfigurations[model]);
            state.isPlayerShip = false;
            state.idleStrategy = IdleStrategy.PLAY_DEAD;
            return { obj, state, mgr: new ShipManagerNpc(obj, state, spaceMgr, new ShipDie(seed)) };
        };
        const station = make('station', { x: 0, y: 0 }, 'small-station', Faction.Gravitas, 1);
        const gvts = make('gvts', { x: 0, y: 6000 }, 'gravitas', Faction.Gravitas, 2);
        const raider = make('raider', { x: 3000, y: 0 }, 'dragonfly-MK1', Faction.Raiders, 3);
        raider.state.threat.character = aggroCharacters[character];
        spaceMgr.insertBulk([station.obj, gvts.obj, raider.obj]);
        spaceMgr.forceFlushEntities();
        spaceMgr.state.botOrderCommands.push({ ids: ['raider'], order: { type: 'attack', targetId: 'station' } });
        const managers = [station.mgr, gvts.mgr, raider.mgr];
        let blast = 0;
        const run = (seconds: number, burst: boolean) => {
            for (const id of makeIterationsData(seconds, seconds * 20)) {
                if (burst) {
                    // the GVTS's own blasts, landing on the raider: the real damage -> threat path
                    const explosion = new Explosion().init(`gvts-blast-${blast++}`, Vec2.make(raider.obj.position), 20);
                    explosion.shipId = 'gvts';
                    explosion.damageType = 'HiExp';
                    spaceMgr.insert(explosion);
                }
                for (const mgr of managers) {
                    mgr.update(id);
                }
                spaceMgr.update(id);
            }
        };
        return { raider, run };
    }

    it('a Brawler hit by the GVTS turns on it without dropping its order, then returns to the station', () => {
        const { raider, run } = scene('Brawler');
        run(5, false);
        expect(raider.state.weaponsTarget.targetId).to.equal('station');
        run(1, true);
        run(1, false);
        expect(raider.state.threat.heldId).to.equal('gvts');
        expect(raider.state.weaponsTarget.targetId).to.equal('gvts');
        expect(raider.state.order).to.equal(Order.ATTACK);
        expect(raider.state.orderTargetId).to.equal('station');
        run(120, false);
        expect(raider.state.threat.heldId).to.equal(null);
        expect(raider.state.weaponsTarget.targetId).to.equal('station');
    });

    it('a Fixated raider never turns', () => {
        const { raider, run } = scene('Fixated');
        run(5, false);
        run(1, true);
        run(1, false);
        expect(raider.state.threat.heldId).to.equal(null);
        expect(raider.state.weaponsTarget.targetId).to.equal('station');
    });
});
