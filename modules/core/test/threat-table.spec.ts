import {
    Explosion,
    Faction,
    IdleStrategy,
    Order,
    PROVOKING_HIT_DAMAGE,
    ShipDie,
    ShipManager,
    ShipManagerNpc,
    ShipManagerPc,
    SpaceManager,
    Spaceship,
    ThreatTable,
    Vec2,
    XY,
    aggroCharacters,
    makeShipState,
    missionWeightForHits,
    shipConfigurations,
    withMissionWeight,
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
        // held 20 s (memory) after the last hit, then memory x ln(peak / (missionWeight / (1 + margin)))
        // = 20 x ln(2.5) ~ 18 s of decay
        expect(seconds).to.be.within(36, 41);
        expect(table.switches).to.equal(2);
    });

    it('a grudge holds at full strength while the attacker keeps hitting within memorySeconds', () => {
        const table = brawler();
        const { missionWeight, memorySeconds } = aggroCharacters.Brawler;
        table.add('a', missionWeight * 2);
        const ticksPerHit = (memorySeconds / 2) * 20; // a hit every half memory, 20 ticks/s
        for (let tick = 1; tick <= ticksPerHit * 10; tick++) {
            table.update(0.05, [], never);
            if (tick % ticksPerHit === 0) {
                table.add('a', 1);
            }
        }
        expect(table.heldId).to.equal('a');
        expect(table.get('a')).to.be.greaterThan(missionWeight * 2);
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

    it('re-weighting a character scales its presence with the mission and leaves Fixated alone', () => {
        const hunter = withMissionWeight(aggroCharacters.Hunter, 60);
        expect(hunter.missionWeight).to.equal(60);
        expect(hunter.presenceRate / hunter.missionWeight).to.be.closeTo(
            aggroCharacters.Hunter.presenceRate / aggroCharacters.Hunter.missionWeight,
            1e-12,
        );
        expect(withMissionWeight(aggroCharacters.Fixated, 60)).to.equal(aggroCharacters.Fixated);
    });

    it('a mission worth 3 provoking hits holds through the 3rd and flips on the 4th (switch margin 1.25)', () => {
        const table = new ThreatTable();
        table.character = withMissionWeight(aggroCharacters.Brawler, missionWeightForHits(3));
        for (let hit = 1; hit <= 3; hit++) {
            table.add('a', PROVOKING_HIT_DAMAGE);
            table.update(0.05, [], never);
        }
        expect(table.heldId).to.equal(null);
        table.add('a', PROVOKING_HIT_DAMAGE);
        table.update(0.05, [], never);
        expect(table.heldId).to.equal('a');
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
        raider.mgr.setAggroCharacter(aggroCharacters[character]);
        spaceMgr.insertBulk([station.obj, gvts.obj, raider.obj]);
        spaceMgr.forceFlushEntities();
        spaceMgr.state.botOrderCommands.push({ ids: ['raider'], order: { type: 'attack', targetId: 'station' } });
        const managers: ShipManager[] = [station.mgr, gvts.mgr, raider.mgr];
        /** The raider handed to a crew, the way `GameManager.convertShipType` does it. */
        const convertRaiderToPlayer = () => {
            const state = raider.state.clone();
            state.isPlayerShip = true;
            const mgr = new ShipManagerPc(raider.obj, state, spaceMgr, new ShipDie(4));
            managers[managers.indexOf(raider.mgr)] = mgr;
            return { state, mgr };
        };
        let blast = 0;
        const run = (seconds: number, burst: boolean) => {
            for (const id of makeIterationsData(seconds, seconds * 20)) {
                if (burst) {
                    // the GVTS's own blasts, landing on the raider: the real damage -> threat path
                    const explosion = new Explosion().init(
                        `gvts-blast-${blast++}`,
                        Vec2.make(raider.obj.position),
                        PROVOKING_HIT_DAMAGE,
                    );
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
        return { raider, run, convertRaiderToPlayer };
    }

    it('a Brawler hit by the GVTS turns on it without dropping its order, then returns to the station', () => {
        const { raider, run } = scene('Brawler');
        run(5, false);
        expect(raider.state.weaponsTarget.targetId).to.equal('station');
        expect(raider.state.aggroTargetId, 'GM sees no aggro target on the standing order').to.equal('');
        run(1, true);
        run(1, false);
        expect(raider.mgr.aggroHeldId).to.equal('gvts');
        expect(raider.state.aggroTargetId, 'GM sees the grudge').to.equal('gvts');
        expect(raider.state.weaponsTarget.targetId).to.equal('gvts');
        expect(raider.state.order).to.equal(Order.ATTACK);
        expect(raider.state.orderTargetId).to.equal('station');
        run(120, false);
        expect(raider.mgr.aggroHeldId).to.equal(null);
        expect(raider.state.aggroTargetId, 'GM sees the grudge fade').to.equal('');
        expect(raider.state.weaponsTarget.targetId).to.equal('station');
    });

    it('a Brawler handed to a crew mid-grudge shows no aggro target and never turns on its attacker', () => {
        const { raider, run, convertRaiderToPlayer } = scene('Brawler');
        run(5, false);
        run(1, true);
        run(1, false);
        expect(raider.state.aggroTargetId).to.equal('gvts');
        const player = convertRaiderToPlayer();
        player.mgr.setTarget('station');
        run(1, true);
        run(1, false);
        expect(player.state.aggroTargetId).to.equal('');
        expect(player.state.weaponsTarget.targetId).to.equal('station');
    });

    it('a Fixated raider never turns', () => {
        const { raider, run } = scene('Fixated');
        run(5, false);
        run(1, true);
        run(1, false);
        expect(raider.mgr.aggroHeldId).to.equal(null);
        expect(raider.state.aggroTargetId).to.equal('');
        expect(raider.state.weaponsTarget.targetId).to.equal('station');
    });
});
