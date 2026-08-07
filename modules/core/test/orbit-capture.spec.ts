import {
    Faction,
    Order,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

const dragonflyMK1Config = shipConfigurations['dragonfly-MK1'];
const dragonflyMK2Config = shipConfigurations['dragonfly-MK2'];

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

/**
 * Same 140km approach, but against a real, fully-initialized `large-station` target (radius
 * 50.4m) instead of a bare uninitialized SpaceObject — the wave-defence map's actual geometry
 * (issue #2092, a regression that survives #2083/#2088's fix in that isolated-geometry test).
 */
function createRealStationAttackScenario(dieRoll: number) {
    const spaceMgr = new SpaceManager();

    const target = new Spaceship().init('target', new Vec2(140_000, 0), 'large-station', Faction.Gravitas);
    // Stations are anchored structures (largeStationSmartPilot.maxSpeed is already 0) — this
    // mirrors wave-defence.ts freezing them so they can't be flung by weapon-impact physics
    // (issue #2092).
    target.freeze = true;
    spaceMgr.insert(target);

    const raiderObj = new Spaceship();
    raiderObj.id = 'raider';
    raiderObj.faction = Faction.Raiders;
    const die = new MockDie();
    die.expectedRoll = dieRoll;
    const raiderMgr = new ShipManagerNpc(raiderObj, makeShipState(raiderObj.id, dragonflyMK2Config), spaceMgr, die);
    spaceMgr.insert(raiderObj);
    spaceMgr.forceFlushEntities();

    raiderMgr.state.order = Order.ATTACK;
    raiderMgr.state.orderTargetId = target.id;

    return { spaceMgr, raiderObj, raiderMgr, target };
}

describe('ATTACK-ordered NPC orbit capture against a real large-station target (issue #2092)', () => {
    for (const dieRoll of [0, 0.3, 0.6, 0.99]) {
        it(`captures and holds within the chain-gun track band (die roll ${dieRoll})`, () => {
            const { spaceMgr, raiderMgr, raiderObj, target } = createRealStationAttackScenario(dieRoll);

            let closestApproach = Infinity;
            let finalDistance = Infinity;
            for (const id of makeIterationsData(10 * 60, 10 * 60 * 5)) {
                raiderMgr.update(id);
                spaceMgr.update(id);
                finalDistance = XY.lengthOf(XY.difference(target.position, raiderObj.position));
                closestApproach = Math.min(closestApproach, finalDistance);
            }

            expect(closestApproach, 'raider never got within its track band').to.be.lessThan(4_500);
            expect(finalDistance, 'raider was not holding within its track band at the end of the engagement')
                .to.be.lessThan(4_500)
                .and.to.be.greaterThan(500);
        });
    }
});
