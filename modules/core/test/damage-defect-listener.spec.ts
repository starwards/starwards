import { DamageManager, SpaceManager, Spaceship, demoShip, makeShipState } from '../src';

import { HeatManager } from '../src/ship/heat-manager';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

function setUp() {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, demoShip);
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const die = new MockDie();
    die.expectedRoll = 0;
    const damageManager = new DamageManager(ship, state, spaceManager, die);
    const defects: { system: string; cause: string }[] = [];
    damageManager.onDefect = (system, cause) => defects.push({ system: system.name, cause });
    return { state, damageManager, heatManager: new HeatManager(state, damageManager), defects };
}

describe('DamageManager.onDefect', () => {
    it('reports a hit defect with the system it landed on', () => {
        const { state, damageManager, defects } = setUp();
        damageManager.damageSystem(state.radars[0], { id: 'shell-1', amount: state.radars[0].design.damage50 }, 1);
        expect(defects).to.deep.equal([{ system: state.radars[0].name, cause: 'hit' }]);
    });

    it('reports an overheat defect as overheat', () => {
        const { state, heatManager, defects } = setUp();
        heatManager.addHeat(1000, state.chainGuns[0]);
        expect(defects.length).to.be.greaterThan(0);
        expect(defects.every((d) => d.cause === 'overheat' && d.system === state.chainGuns[0].name)).to.equal(true);
    });

    it('reports warp penalty damage as warp', () => {
        const { damageManager, defects } = setUp();
        damageManager.damageAllSystems({ id: 'warp_start:test-ship:0', amount: 1000 });
        expect(defects.length).to.be.greaterThan(0);
        expect(defects.every((d) => d.cause === 'warp')).to.equal(true);
    });
});
