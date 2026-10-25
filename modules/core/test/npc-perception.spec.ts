import {
    Faction,
    HARD_NPC_AI,
    NpcAiProfile,
    Order,
    ScanLevel,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    TODAY_NPC_AI,
    Vec2,
    makeShipState,
    npcDifficultyPresets,
    setOmniRadarSector,
    shipConfigurations,
} from '../src';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

function setup(profile: NpcAiProfile, scanLevel: ScanLevel) {
    const spaceMgr = new SpaceManager();
    const npcObj = new Spaceship();
    npcObj.id = 'npc';
    npcObj.faction = Faction.Raiders;
    npcObj.position.setValue(new Vec2(0, 0));
    const state = makeShipState('npc', shipConfigurations['dragonfly-MK1']);
    state.aiProfile = profile;
    const npc = new ShipManagerNpc(npcObj, state, spaceMgr, new MockDie());
    spaceMgr.insert(npcObj);
    const victim = new Spaceship();
    victim.id = 'victim';
    victim.radius = 50;
    victim.faction = Faction.Gravitas;
    victim.position.setValue(new Vec2(1000, 0));
    spaceMgr.insert(victim);
    setOmniRadarSector(npcObj, 10_000);
    spaceMgr.update({ deltaSeconds: 0.05, deltaSecondsAvg: 0.05, totalSeconds: 0 });
    victim.scanLevels[Faction.Raiders] = scanLevel;
    return { spaceMgr, npc, victim, npcObj };
}

function tick(s: ReturnType<typeof setup>, n = 1) {
    for (let i = 0; i < n; i++) {
        const id = { deltaSeconds: 0.05, deltaSecondsAvg: 0.05, totalSeconds: 0.05 * (i + 1) };
        s.npc.update(id);
        s.spaceMgr.update(id);
    }
}

const hostiles = (s: ReturnType<typeof setup>) => [...s.npc.automationManager.hostileIdsInReach()];

describe('NPC perception and difficulty', () => {
    it('the test profile sees an unscanned hostile', () => {
        const s = setup(TODAY_NPC_AI, ScanLevel.UFO);
        tick(s, 3);
        expect(hostiles(s)).to.deep.equal(['victim']);
    });

    it('faction perception ignores a hostile its faction has not scanned', () => {
        const s = setup(HARD_NPC_AI, ScanLevel.UFO);
        tick(s, 3);
        expect(hostiles(s)).to.deep.equal([]);
    });

    it('faction perception ignores a scanned hostile outside its faction field of view', () => {
        const s = setup(HARD_NPC_AI, ScanLevel.BASIC);
        s.victim.position.setValue(new Vec2(900000, 0));
        tick(s, 3);
        expect(hostiles(s)).to.deep.equal([]);
    });

    it('faction perception sees a hostile in view at BASIC scan', () => {
        const s = setup(HARD_NPC_AI, ScanLevel.BASIC);
        tick(s, 3);
        expect(hostiles(s)).to.deep.equal(['victim']);
    });

    it('presets run slower decisions at lower difficulty', () => {
        expect(npcDifficultyPresets.hard.aiTickRatio).to.equal(1);
        expect(npcDifficultyPresets.normal.aiTickRatio).to.be.greaterThan(1);
        expect(npcDifficultyPresets.easy.aiTickRatio).to.be.greaterThan(npcDifficultyPresets.normal.aiTickRatio);
    });

    it('a 1:10 tick ratio defers perception to the next decision tick, while physics keeps running', () => {
        const s = setup({ ...TODAY_NPC_AI, aiTickRatio: 10 }, ScanLevel.BASIC);
        tick(s, 1);
        s.victim.faction = Faction.NONE; // no longer hostile; belief only refreshes on a decision tick
        s.npcObj.velocity.setValue(new Vec2(10, 0));
        tick(s, 5);
        expect(hostiles(s)).to.deep.equal(['victim']);
        expect(s.npcObj.position.x).to.be.greaterThan(0);
        tick(s, 6);
        expect(hostiles(s)).to.deep.equal([]);
    });

    it('order stays untouched by perception', () => {
        const s = setup(HARD_NPC_AI, ScanLevel.UFO);
        tick(s, 2);
        expect(s.npc.state.order).to.equal(Order.NONE);
    });
});
