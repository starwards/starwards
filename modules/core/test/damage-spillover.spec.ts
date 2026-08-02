import { DamageManager, ShipDie, SpaceManager, Spaceship, demoShip, makeShipState } from '../src';

import { Die } from '../src/ship/ship-manager-abstract';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

// Spec §4: defect rolls are linear in the event amount, p = amount / (2 × damage50),
// capped at 50% per roll; overkill spills into extra rolls instead of saturating.
// Expected defects per event = amount / (2 × damage50).

function setUpDamageManager(die: Die) {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, demoShip);
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, die);
    return { state, damageManager };
}

describe('spillover defect rolls (spec §4)', () => {
    it('expected defects grow linearly with the event amount', () => {
        const die = new ShipDie(1234);
        const { state, damageManager } = setUpDamageManager(die);
        const damage50 = state.radars[0].design.damage50;
        const events = 200;
        let defects = 0;
        for (let i = 0; i < events; i++) {
            state.radars[0].malfunctionRangeFactor = 0; // keep the system healthy; count via the die
            damageManager.damageSystem(state.radars[0], { id: `event-${i}`, amount: 4 * damage50 }, 1);
            expect(state.radars[0].malfunctionRangeFactor / 0.05).to.be.at.most(4.001);
            defects += Math.round(state.radars[0].malfunctionRangeFactor / 0.05);
        }
        // expected defects per event = amount / (2 × damage50) = 2; sd over 200 events ≈ 14
        expect(defects).to.be.closeTo(2 * events, 60);
    });

    it('no single roll is ever more likely to succeed than fail (50% cap)', () => {
        const die = new MockDie();
        die.expectedRoll = 0.6; // above the cap — every roll must fail no matter the amount
        const { state, damageManager } = setUpDamageManager(die);
        damageManager.damageSystem(state.radars[0], { id: 'overkill', amount: 1_000_000 }, 1);
        expect(state.radars[0].malfunctionRangeFactor).to.equal(0);
    });

    it('below one damage50 the success chance is linear: p = amount / (2 × damage50)', () => {
        const die = new MockDie();
        die.expectedRoll = 0.4;
        const { state, damageManager } = setUpDamageManager(die);
        const damage50 = state.radars[0].design.damage50;
        // p = 0.3 < 0.4 → no defect
        damageManager.damageSystem(state.radars[0], { id: 'weak', amount: 0.6 * damage50 }, 1);
        expect(state.radars[0].malfunctionRangeFactor).to.equal(0);
        // p = 0.45 > 0.4 → one defect
        damageManager.damageSystem(state.radars[0], { id: 'stronger', amount: 0.9 * damage50 }, 1);
        expect(state.radars[0].malfunctionRangeFactor).to.be.closeTo(0.05, 0.0001);
    });

    it('overkill spills into extra defects instead of saturating', () => {
        const die = new MockDie();
        die.expectedRoll = 0; // every roll with p > 0 succeeds
        const { state, damageManager } = setUpDamageManager(die);
        const damage50 = state.radars[0].design.damage50;
        damageManager.damageSystem(state.radars[0], { id: 'burst', amount: 4 * damage50 }, 1);
        // remaining walks 4·d50 → 0 in d50 steps: exactly 4 rolls, all successful
        expect(state.radars[0].malfunctionRangeFactor).to.be.closeTo(4 * 0.05, 0.0001);
    });

    it('absurd overkill terminates promptly instead of grinding damage50-sized steps', () => {
        // a MAX_SAFE_INTEGER-amount event must not iterate amount/damage50 (~1e14) times;
        // past the point where every roll sits at the 0.5 cap, extra rolls change nothing
        // for any real system, so the roll count is capped
        const die = new MockDie();
        die.expectedRoll = 1; // every roll fails — the system never breaks, the loop must still end
        const { state, damageManager } = setUpDamageManager(die);
        damageManager.damageSystem(state.radars[0], { id: 'nuke', amount: Number.MAX_SAFE_INTEGER }, 1);
        expect(state.radars[0].malfunctionRangeFactor).to.equal(0);
    });

    it('armor attenuation scales the roll stack the same way (exposure factor)', () => {
        const die = new MockDie();
        die.expectedRoll = 0;
        const { state, damageManager } = setUpDamageManager(die);
        const damage50 = state.radars[0].design.damage50;
        damageManager.damageSystem(state.radars[0], { id: 'attenuated', amount: 4 * damage50 }, 0.5);
        expect(state.radars[0].malfunctionRangeFactor).to.be.closeTo(2 * 0.05, 0.0001);
    });

    it('when the victim breaks mid-application the remainder dissipates', () => {
        const die = new MockDie();
        die.expectedRoll = 0;
        const { state, damageManager } = setUpDamageManager(die);
        const damage50 = state.radars[0].design.damage50;
        const breakThreshold = 1 - state.radars[0].design.rangeEaseFactor * 2;
        state.radars[0].malfunctionRangeFactor = breakThreshold - 0.01; // one defect from broken
        damageManager.damageSystem(state.radars[0], { id: 'overkill', amount: 100 * damage50 }, 1);
        // exactly one more defect lands, then the loop stops — no post-mortem pile-up
        expect(state.radars[0].malfunctionRangeFactor).to.be.closeTo(breakThreshold - 0.01 + 0.05, 0.0001);
    });

    it('successive defects from one event draw independent branches', () => {
        // a burst on maneuvering must be able to hit both defect branches (efficiency and
        // afterburner fuel) within a single event — the per-roll die keys must differ
        const die = new ShipDie(42);
        const { state, damageManager } = setUpDamageManager(die);
        const damage50 = state.maneuvering.design.damage50;
        for (let i = 0; i < 40 && !(state.maneuvering.efficiency < 1 && state.maneuvering.afterBurnerFuel < 1); i++) {
            state.maneuvering.efficiency = 1;
            state.maneuvering.afterBurnerFuel = 1;
            damageManager.damageSystem(state.maneuvering, { id: `burst-${i}`, amount: 20 * damage50 }, 1);
        }
        expect(state.maneuvering.efficiency, 'efficiency branch').to.be.lessThan(1);
        expect(state.maneuvering.afterBurnerFuel, 'afterburner branch').to.be.lessThan(1);
    });

    it('replaying the same event sequence with the same seed yields identical defects', () => {
        const run = () => {
            const { state, damageManager } = setUpDamageManager(new ShipDie(7));
            const damage50 = state.radars[0].design.damage50;
            for (let i = 0; i < 20; i++) {
                damageManager.damageSystem(state.radars[0], { id: `event-${i}`, amount: 3 * damage50 }, 1);
            }
            return state.radars[0].malfunctionRangeFactor;
        };
        expect(run()).to.equal(run());
    });

    it('repeated applications of one lingering damage id keep rolling fresh dice', () => {
        // explosion streams reuse the explosion's object id every tick — the per-application
        // counter must decorrelate them (a pure (seed,id) hash would repeat the same outcome)
        const die = new ShipDie(99);
        const { state, damageManager } = setUpDamageManager(die);
        const damage50 = state.radars[0].design.damage50;
        const outcomes = new Set<number>();
        for (let i = 0; i < 30; i++) {
            state.radars[0].malfunctionRangeFactor = 0;
            damageManager.damageSystem(state.radars[0], { id: 'same-explosion', amount: damage50 }, 1);
            outcomes.add(state.radars[0].malfunctionRangeFactor);
        }
        // p = 0.5 per application: over 30 applications both hit and miss must occur
        expect(outcomes.size).to.be.greaterThan(1);
    });
});
