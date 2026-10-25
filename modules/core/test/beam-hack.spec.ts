import {
    Faction,
    HackLevel,
    PowerLevel,
    ScanLevel,
    ShipManagerNpc,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    makeShipState,
    shipConfigurations,
} from '../src';

import { MockDie } from './ship-test-harness';
import { RepairPriority } from '../src/ship/repair-queue';
import { ShipManager } from '../src/ship/ship-manager-abstract';
import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

// the scan beam rests dead ahead, so a target on the +x axis is inside it and stays FULL
function hackerAndTarget(targetKind: 'pc' | 'npc' = 'pc') {
    const spaceMgr = new SpaceManager();
    const ships = new Map<string, ShipManager>();
    const hackerObj = new Spaceship();
    hackerObj.id = 'hacker';
    hackerObj.faction = Faction.Gravitas;
    const hacker = new ShipManagerPc(
        hackerObj,
        makeShipState(hackerObj.id, demoShipConfig),
        spaceMgr,
        new MockDie(),
        ships,
    );
    ships.set(hackerObj.id, hacker);
    spaceMgr.insert(hackerObj);
    hacker.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    hacker.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

    const targetObj = new Spaceship();
    targetObj.id = 'target';
    targetObj.radius = demoShipConfig.radius;
    targetObj.faction = Faction.Raiders;
    targetObj.position = Vec2.make({ x: 1000, y: 0 });
    spaceMgr.insert(targetObj);
    const Manager = targetKind === 'npc' ? ShipManagerNpc : ShipManagerPc;
    const target = new Manager(targetObj, makeShipState(targetObj.id, demoShipConfig), spaceMgr, new MockDie(), ships);
    ships.set(targetObj.id, target);
    spaceMgr.forceFlushEntities();
    spaceMgr.factionIntel.setScanLevel(targetObj.id, hackerObj.faction, ScanLevel.FULL);
    hacker.state.signalsTargetId = targetObj.id;
    hacker.state.signals.power = PowerLevel.MAX;

    let totalSeconds = 0;
    const run = (seconds: number) => {
        const dt = 0.05;
        for (let i = 0; i < Math.round(seconds / dt); i++) {
            totalSeconds += dt;
            const id = { deltaSeconds: dt, deltaSecondsAvg: dt, totalSeconds };
            hacker.update(id);
            target.update(id);
            spaceMgr.update(id);
        }
    };
    run(0.1);
    return { spaceMgr, hacker, target, targetObj, hackerObj, run };
}

describe('beam hacking stage 1 (M4.76)', () => {
    it('fills a progress bar while FULL is held, then takes the system offline and it recovers', () => {
        const { hacker, target, run } = hackerAndTarget();
        const hackSeconds = target.state.thrusters[0].design.hackSeconds;
        const offlineSeconds = target.state.thrusters[0].design.hackOfflineSeconds;
        hacker.state.signals.hackSystem = 'thrusters';
        run(hackSeconds / 2);
        expect(hacker.state.signals.hackProgress).to.be.within(0.3, 0.7);
        expect(target.state.thrusters[0].effectiveness).to.be.greaterThan(0);

        run(hackSeconds / 2 + 0.5);
        for (const thruster of target.state.thrusters) {
            expect(thruster.hacked).to.equal(HackLevel.DISABLED);
            expect(thruster.effectiveness).to.equal(0);
        }
        expect(hacker.state.signals.hackSystem).to.equal('');

        run(offlineSeconds + 0.5);
        for (const thruster of target.state.thrusters) {
            expect(thruster.hacked).to.equal(HackLevel.OK);
            expect(thruster.effectiveness).to.be.greaterThan(0);
        }
    });

    it('cancels when FULL lapses', () => {
        const { hacker, target, targetObj, hackerObj, spaceMgr, run } = hackerAndTarget();
        hacker.state.signals.hackSystem = 'thrusters';
        run(1);
        expect(hacker.state.signals.hackProgress).to.be.greaterThan(0);
        spaceMgr.factionIntel.setScanLevel(targetObj.id, hackerObj.faction, ScanLevel.SNAPSHOT);
        run(0.1);
        expect(hacker.state.signals.hackProgress).to.equal(0);
        expect(hacker.state.signals.hackSystem).to.equal('');
        run(20);
        expect(target.state.thrusters[0].hacked).to.equal(HackLevel.OK);
    });

    it('rejects armor, which cannot be hacked', () => {
        const { hacker, run } = hackerAndTarget();
        hacker.state.signals.hackSystem = 'armor';
        run(0.2);
        expect(hacker.state.signals.hackProgress).to.equal(0);
        expect(hacker.state.signals.hackSystem).to.equal('');
        expect(hacker.state.signals.hackRefusal).to.contain('not hackable');
    });

    it('a firewall repair running on the target cancels an in-progress hack', () => {
        const { hacker, target, run } = hackerAndTarget();
        target.state.repairQueue.cyclePriorityCommands.push({ protocolId: 'firewallRepair', direction: 'up' });
        run(0.2);
        const slot = target.state.repairQueue.slots.find((s) => s.protocolId === 'firewallRepair');
        expect(slot?.priority).to.equal(RepairPriority.RUNNING);
        hacker.state.signals.hackSystem = 'thrusters';
        run(1);
        expect(hacker.state.signals.hackProgress).to.equal(0);
        expect(hacker.state.signals.hackSystem).to.equal('');
    });

    it('a completed firewall repair ends an active offline window early', () => {
        const { hacker, target, run } = hackerAndTarget();
        hacker.state.signals.hackSystem = 'chainGuns';
        run(target.state.chainGuns[0].design.hackSeconds + 0.5);
        expect(target.state.chainGuns[0].effectiveness).to.equal(0);
        target.state.repairQueue.cyclePriorityCommands.push({ protocolId: 'firewallRepair', direction: 'up' });
        run(0.2);
        const slot = target.state.repairQueue.slots.find((s) => s.protocolId === 'firewallRepair');
        expect(slot?.priority).to.equal(RepairPriority.RUNNING);
        run(60);
        expect(target.state.chainGuns[0].hacked).to.equal(HackLevel.OK);
        expect(target.state.chainGuns[0].effectiveness).to.be.greaterThan(0);
    });

    it('an NPC cannot thrust while its thrusters are offline, and thrusts again after', () => {
        const { hacker, target, targetObj, run } = hackerAndTarget('npc');
        const npc = target as ShipManagerNpc;
        const speed = () => Math.hypot(targetObj.velocity.x, targetObj.velocity.y);
        npc.state.smartPilot.maneuvering.x = 1;
        run(2);
        const free = speed();
        expect(free).to.be.greaterThan(1);

        hacker.state.signals.hackSystem = 'thrusters';
        run(npc.state.thrusters[0].design.hackSeconds + 0.5);
        expect(npc.state.thrusters.every((t) => t.effectiveness === 0)).to.equal(true);
        const before = speed();
        run(1);
        expect(speed()).to.be.at.most(before + 0.01);
    });

    it('an NPC gun fires while online and stays silent while its chain gun is offline', () => {
        const { hacker, target, spaceMgr, run } = hackerAndTarget('npc');
        const gun = target.state.chainGuns[0];
        const seen = new Set<string>();
        const shellsFired = () => {
            for (const p of spaceMgr.state.getAll('Projectile')) {
                if (p.shipId === 'target') {
                    seen.add(p.id);
                }
            }
            return seen.size;
        };
        gun.isFiring = true;
        run(0.5);
        shellsFired();
        run(0.5);
        const online = shellsFired();
        expect(online).to.be.greaterThan(0);

        hacker.state.signals.hackSystem = 'chainGuns';
        run(gun.design.hackSeconds + 0.5);
        expect(gun.effectiveness).to.equal(0);
        gun.isFiring = true;
        const before = shellsFired();
        for (let i = 0; i < 20; i++) {
            run(0.05);
            shellsFired();
        }
        expect(shellsFired()).to.equal(before);
    });
});
