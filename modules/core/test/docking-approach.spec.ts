import {
    DockingMode,
    Faction,
    ShipManagerPc,
    SpaceManager,
    Spaceship,
    Vec2,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];
const largeStationConfig = shipConfigurations['large-station'];

/**
 * The C6 acceptance test from issue #2092's design redirect: docking distance math is
 * radius-relative (`getClosestDockingTarget`, `DockingManager.calcDockingMode`), so growing
 * `large-station`'s radius to 1200m must not strand a docking pilot short of DOCKED.
 */
describe('Pilot docking approach against a real station hull (issue #2092 radius rework)', () => {
    it('a player ship commanded to dock reaches DOCKED at a 1200m-radius large-station', () => {
        const spaceMgr = new SpaceManager();

        const station = new Spaceship().init('station', new Vec2(0, 0), 'large-station', Faction.Gravitas);
        spaceMgr.insert(station);
        expect(station.radius).to.equal(largeStationConfig.radius);

        // 500m off the station's surface -- comfortably inside demo-ship's own 1000m
        // maxDockingDistance (the docking-clamp equipment's range, not the station's).
        const shipObj = new Spaceship().init(
            'player',
            new Vec2(station.radius + 500, 0),
            'demo-ship',
            Faction.Gravitas,
        );
        const die = new MockDie();
        const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
        spaceMgr.insert(shipObj);
        spaceMgr.forceFlushEntities();

        shipMgr.state.docking.targetId = station.id;
        shipMgr.state.docking.mode = DockingMode.DOCKING;

        let reachedDocked = false;
        for (const id of makeIterationsData(600, 600 * 10)) {
            shipMgr.update(id);
            spaceMgr.update(id);
            if ((shipMgr.state.docking.mode as DockingMode) === DockingMode.DOCKED) {
                reachedDocked = true;
                break;
            }
        }

        expect(reachedDocked, 'ship never reached DOCKED').to.equal(true);
    });
});
