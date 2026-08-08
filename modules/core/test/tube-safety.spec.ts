import {
    Faction,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { ShipDesign } from '../src/ship/make-ship-state';
import { demoShipTube } from '../src/configurations/demo-ship';
import { expect } from 'chai';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

const demoShipConfig = shipConfigurations['demo-ship'];

function makeTwoTubeShip() {
    const twoTubeDesign: ShipDesign = {
        ...demoShipConfig,
        tubes: [
            ['PORT', demoShipTube],
            ['STBD', demoShipTube],
        ],
    };
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'multi-tube';
    shipObj.faction = Faction.Gravitas;
    const die = new MockDie();
    die.expectedRoll = 1;
    const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, twoTubeDesign), spaceMgr, die);
    spaceMgr.insert(shipObj);
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
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

describe('tube safety and ship-level fire command', () => {
    afterEach(() => jest.restoreAllMocks());

    it('spawns every tube with its safety locked', () => {
        const { shipMgr } = makeTwoTubeShip();
        for (const tube of shipMgr.state.tubes) {
            expect(tube.safetyLocked).to.equal(true);
        }
    });

    it('A3: a locked, loaded tube never fires even when commanded', () => {
        const { shipMgr, spaceMgr } = makeTwoTubeShip();
        loadAllTubes(shipMgr, spaceMgr);

        shipMgr.state.fireTubesCommand = true;
        for (const id of makeIterationsData(0.1, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect([...spaceMgr.state.getAll('Projectile')].length).to.equal(0);
    });

    it('A1: one ship-level fire command launches from every loaded, unlocked tube', () => {
        const { shipMgr, spaceMgr } = makeTwoTubeShip();
        loadAllTubes(shipMgr, spaceMgr);
        for (const tube of shipMgr.state.tubes) {
            tube.safetyLocked = false;
        }

        shipMgr.state.fireTubesCommand = true;
        for (const id of makeIterationsData(0.1, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect([...spaceMgr.state.getAll('Projectile')].length).to.equal(2);
    });

    it('A2: a fired tube re-locks itself, so a repeated fire command does not fire it again', () => {
        const { shipMgr, spaceMgr } = makeTwoTubeShip();
        loadAllTubes(shipMgr, spaceMgr);
        shipMgr.state.tubes[0].safetyLocked = false;

        shipMgr.state.fireTubesCommand = true;
        for (const id of makeIterationsData(0.1, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(shipMgr.state.tubes[0].safetyLocked).to.equal(true);
        expect([...spaceMgr.state.getAll('Projectile')].length).to.equal(1);

        shipMgr.state.fireTubesCommand = true;
        for (const id of makeIterationsData(0.1, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect([...spaceMgr.state.getAll('Projectile')].length).to.equal(1); // still just the one shot
    });

    it('A4: unlocking one tube does not unlock another', () => {
        const { shipMgr, spaceMgr } = makeTwoTubeShip();
        loadAllTubes(shipMgr, spaceMgr);
        shipMgr.state.tubes[0].safetyLocked = false;

        expect(shipMgr.state.tubes[1].safetyLocked).to.equal(true);

        shipMgr.state.fireTubesCommand = true;
        for (const id of makeIterationsData(0.1, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect([...spaceMgr.state.getAll('Projectile')].length).to.equal(1); // only the unlocked tube fired
    });
});
