import { Faction, ShipManagerPc, SmartPilotMode, SpaceManager, Spaceship, demoShip, makeShipState } from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { RepairOperationStatus } from '../src/ship/repair-queue';
import { enqueueRepair } from '../src/ship/repair-commands';
import { expect } from 'chai';
import { repairProtocols } from '../src/configurations/repair-protocols';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

function makeShip() {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'tube-repair-ship';
    shipObj.faction = Faction.Gravitas;
    const die = new MockDie();
    const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShip), spaceMgr, die);
    spaceMgr.insert(shipObj);
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
    shipMgr.state.reactor.energy = shipMgr.state.reactor.design.maxEnergy;
    return { shipMgr, spaceMgr };
}

function loadAllTubes(shipMgr: ShipManagerPc, spaceMgr: SpaceManager) {
    for (const tube of shipMgr.state.tubes) {
        tube.loadAmmo = true;
        switchToAvailableAmmo(tube, shipMgr.state.magazine);
    }
    for (const id of makeIterationsData(2, 40)) {
        shipMgr.update(id);
        spaceMgr.update(id);
    }
}

describe('launcher servo recalibration (issue #2110)', () => {
    it('A2: restores tube bearingSkew and rateOfFireFactor to design values on completion', () => {
        const { shipMgr } = makeShip();
        shipMgr.state.tubes[0].bearingSkew = 5;
        shipMgr.state.tubes[0].rateOfFireFactor = 0.5;

        enqueueRepair.setValue(shipMgr.state, { protocolId: 'launcherServoRecalibration' });
        const duration = repairProtocols.launcherServoRecalibration.duration;
        for (const id of makeIterationsData(duration + 0.1, Math.round((duration + 0.1) * 20))) {
            shipMgr.update(id);
        }

        expect(shipMgr.state.repairQueue.recentlyFinished[0]?.status).to.equal(RepairOperationStatus.DONE);
        expect(shipMgr.state.tubes[0].bearingSkew).to.equal(0);
        expect(shipMgr.state.tubes[0].rateOfFireFactor).to.equal(1);
    });

    it('A3: an unlocked, loaded tube does not fire while the protocol is active, and safety is locked again on completion', () => {
        const { shipMgr, spaceMgr } = makeShip();
        loadAllTubes(shipMgr, spaceMgr);
        shipMgr.state.tubes[0].safetyLocked = false;

        enqueueRepair.setValue(shipMgr.state, { protocolId: 'launcherServoRecalibration' });
        shipMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 }); // promote to ACTIVE

        expect(shipMgr.state.tubes[0].power).to.equal(0); // side effect: tubes dark

        shipMgr.state.fireTubesCommand = true;
        for (const id of makeIterationsData(0.5, 5)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect([...spaceMgr.state.getAll('Projectile')].length).to.equal(0);

        const duration = repairProtocols.launcherServoRecalibration.duration;
        for (const id of makeIterationsData(duration, Math.round(duration * 20))) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect(shipMgr.state.tubes[0].safetyLocked).to.equal(true);

        shipMgr.state.fireTubesCommand = true;
        for (const id of makeIterationsData(0.1, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        // still locked by default — no accidental fire the instant power returns
        expect([...spaceMgr.state.getAll('Projectile')].length).to.equal(0);
    });
});
