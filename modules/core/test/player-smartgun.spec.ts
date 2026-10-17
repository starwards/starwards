import {
    Faction,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    makeShipState,
    setOmniRadarSector,
    shipConfigurations,
    solveShellIntercept,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { ShipDesign } from '../src/ship/make-ship-state';
import { demoShipChaingun } from '../src/configurations/demo-ship';
import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];
// player hull turret: +-30 degrees, like the M4.21 player configurations
const hullTurret = { ...demoShipChaingun, turnSpeed: 30, bearingLimit: 30 };
const design: ShipDesign = { ...demoShipConfig, chainGuns: [['FWD', hullTurret]] };

/** Player ship at the origin facing +x... target placed at `bearingDegrees` off the hull's nose. */
function setup(bearingDegrees: number, distance = 2000) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'player';
    shipObj.faction = Faction.Gravitas;
    shipObj.radius = demoShipConfig.radius;
    setOmniRadarSector(shipObj, 10_000);
    const targetObj = new Spaceship();
    targetObj.id = 'target';
    targetObj.faction = Faction.Raiders;
    targetObj.radius = demoShipConfig.radius;
    const rad = ((shipObj.angle + bearingDegrees) * Math.PI) / 180;
    targetObj.position.x = Math.cos(rad) * distance;
    targetObj.position.y = Math.sin(rad) * distance;
    const die = new MockDie();
    die.expectedRoll = 1;
    const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, design), spaceMgr, die);
    shipMgr.state.spaceship.faction = Faction.Gravitas;
    spaceMgr.insert(shipObj);
    spaceMgr.insert(targetObj);
    spaceMgr.forceFlushEntities();
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
    const run = (ticks: number) => {
        for (const id of makeIterationsData(ticks, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
    };
    run(2); // radar sectors settle
    shipMgr.setTarget(targetObj.id);
    return { shipMgr, targetObj, run, mount: shipMgr.state.chainGuns[0] };
}

describe('player smartgun', () => {
    afterEach(() => jest.restoreAllMocks());

    it('is on by default', () => {
        expect(setup(0).shipMgr.state.smartGunnery).to.equal(true);
    });

    it('tracks an in-cone weaponsTarget and sets the fuze, without pulling the trigger', () => {
        const { shipMgr, targetObj, run, mount } = setup(20);
        expect(shipMgr.weaponsTarget).to.not.equal(null);
        mount.shellRangeMode = SmartPilotMode.DIRECT;
        run(100);
        const { aimPoint, secondsToLive } = solveShellIntercept(shipMgr.state, mount, targetObj);
        expect(aimPoint).to.not.equal(null);
        expect(Math.abs(mount.bearingCommand)).to.be.greaterThan(5);
        expect(Math.abs(mount.bearing - mount.bearingCommand)).to.be.lessThan(1);
        expect(mount.shellRange).to.not.equal(0);
        expect(shipMgr.state.smartGunStatus).to.equal('tracking');
        expect(mount.shellSecondsToLive).to.be.closeTo(secondsToLive, 0.2);
        expect(mount.isFiring).to.equal(false);
    });

    it('keeps the officer in charge of the trigger and the ammo', () => {
        const { shipMgr, run, mount } = setup(0);
        mount.projectile = 'None';
        run(5);
        expect(mount.projectile).to.equal('None');
        expect(mount.isFiring).to.equal(false);
        mount.isFiring = true;
        run(5);
        expect(mount.isFiring).to.equal(true);
        mount.isFiring = false;
        run(5);
        expect(mount.isFiring).to.equal(false);
        expect(shipMgr.state.smartGunnery).to.equal(true);
    });

    it('rests the turret when the target is outside the cone', () => {
        const { shipMgr, run, mount } = setup(90);
        mount.bearingCommand = 25;
        run(60);
        expect(mount.bearingCommand).to.equal(0);
        expect(mount.bearing).to.be.closeTo(0, 0.5);
        expect(shipMgr.state.smartGunStatus).to.equal('resting');
        expect(mount.isFiring).to.equal(false);
    });

    it('holds when there is no weapons target', () => {
        const { shipMgr, run, mount } = setup(10);
        shipMgr.setTarget(null);
        mount.bearingCommand = 12;
        run(5);
        expect(mount.bearingCommand).to.equal(12);
        expect(shipMgr.state.smartGunStatus).to.equal('holding');
        expect(mount.isFiring).to.equal(false);
    });

    it('leaves bearing and fuze to the officer when smartGunnery is off', () => {
        const { shipMgr, run, mount } = setup(20);
        shipMgr.state.smartGunnery = false;
        mount.bearingCommand = -7;
        mount.shellRange = 0.25;
        run(10);
        expect(mount.bearingCommand).to.equal(-7);
        expect(mount.shellRange).to.equal(0.25);
        expect(shipMgr.state.smartGunStatus).to.equal('off');
    });

    it('never latches a ceasefire on heat: the trigger stays the officer', () => {
        const { shipMgr, run, mount } = setup(0);
        mount.heat = 99;
        mount.isFiring = true;
        run(5);
        expect(shipMgr.automationManager.isCeasefireLatched(mount)).to.equal(false);
        expect(mount.isFiring).to.equal(true);
    });
});
