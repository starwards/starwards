import { Faction, Order, ShipManagerNpc, SpaceManager, Spaceship, XY, makeShipState, shipConfigurations } from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

const dragonflyMK1Config = shipConfigurations['dragonfly-MK1'];

/**
 * A stationary large-station target and an ATTACK-ordered dragonfly-MK1 raider, 140km out —
 * the failing regime from issue #2083 (a 40km approach reliably recovers; 140km lets the
 * raider reach and hold max speed for 200+ seconds before arrival).
 */
function createAttackScenario(dieRoll: number) {
    const spaceMgr = new SpaceManager();

    const target = new Spaceship();
    target.id = 'target';
    target.faction = Faction.Gravitas;
    target.position.setValue({ x: 140_000, y: 0 });
    spaceMgr.insert(target);

    const raiderObj = new Spaceship();
    raiderObj.id = 'raider';
    raiderObj.faction = Faction.Raiders;
    const die = new MockDie();
    die.expectedRoll = dieRoll;
    const raiderMgr = new ShipManagerNpc(raiderObj, makeShipState(raiderObj.id, dragonflyMK1Config), spaceMgr, die);
    spaceMgr.insert(raiderObj);
    spaceMgr.forceFlushEntities();

    raiderMgr.state.order = Order.ATTACK;
    raiderMgr.state.orderTargetId = target.id;

    return { spaceMgr, raiderObj, raiderMgr, target };
}

function runSimMinutes(
    spaceMgr: SpaceManager,
    raiderMgr: ShipManagerNpc,
    raiderObj: Spaceship,
    target: Spaceship,
    minutes: number,
): { closestApproach: number; maxDistanceAfterCapture: number } {
    let closestApproach = Infinity;
    let captured = false;
    let maxDistanceAfterCapture = 0;
    for (const id of makeIterationsData(minutes * 60, minutes * 60 * 5)) {
        raiderMgr.update(id);
        spaceMgr.update(id);
        const distance = XY.lengthOf(XY.difference(target.position, raiderObj.position));
        closestApproach = Math.min(closestApproach, distance);
        if (closestApproach < 15_000) {
            captured = true;
        }
        if (captured) {
            maxDistanceAfterCapture = Math.max(maxDistanceAfterCapture, distance);
        }
    }
    return { closestApproach, maxDistanceAfterCapture };
}

describe('ATTACK-ordered NPC orbit capture after a high-speed pass (issue #2083)', () => {
    // A1 + A2: replicate across several RNG rolls (the reported divergence is a coin flip)
    for (const dieRoll of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
        it(`captures and stays bounded within the track band (die roll ${dieRoll})`, () => {
            const { spaceMgr, raiderMgr, raiderObj, target } = createAttackScenario(dieRoll);

            const { closestApproach, maxDistanceAfterCapture } = runSimMinutes(
                spaceMgr,
                raiderMgr,
                raiderObj,
                target,
                15,
            );

            expect(closestApproach, 'raider never got within its track band').to.be.lessThan(15_000);
            expect(maxDistanceAfterCapture, 'raider drifted back out after first close approach').to.be.lessThan(
                30_000,
            );
        });
    }

    // A3: the 40km case must keep working
    it('still captures orbit from a 40km approach', () => {
        const { spaceMgr, raiderMgr, raiderObj, target } = createAttackScenario(0.5);
        raiderObj.position.setValue({ x: 100_000, y: 0 }); // 40km from the 140km target

        const { closestApproach, maxDistanceAfterCapture } = runSimMinutes(spaceMgr, raiderMgr, raiderObj, target, 15);

        expect(closestApproach).to.be.lessThan(15_000);
        expect(maxDistanceAfterCapture).to.be.lessThan(30_000);
    });
});
