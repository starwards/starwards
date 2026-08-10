import {
    Asteroid,
    Derelict,
    Explosion,
    Faction,
    HackLevel,
    PowerLevel,
    Projectile,
    ScanLevel,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    makeShipState,
    shipConfigurations,
} from '../src';
import { JobStatus } from '../src/ship/signals-job';

import { MockDie } from './ship-test-harness';
import { ShipManager } from '../src/ship/ship-manager-abstract';
import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

function shipWithContactInSight(targetScanLevel: ScanLevel = ScanLevel.UFO) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'ship1';
    shipObj.faction = Faction.Gravitas;
    const die = new MockDie();
    const ships = new Map<string, ShipManager>();
    const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die, ships);
    ships.set(shipObj.id, shipMgr);
    spaceMgr.insert(shipObj);
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

    // Create a target ship within radar range
    const targetObj = new Spaceship();
    targetObj.id = 'target1';
    targetObj.radius = demoShipConfig.radius;
    targetObj.faction = Faction.Raiders;
    targetObj.position = Vec2.make({ x: 1000, y: 0 });
    spaceMgr.insert(targetObj);
    const targetDie = new MockDie();
    const targetMgr = new ShipManagerPc(
        targetObj,
        makeShipState(targetObj.id, demoShipConfig),
        spaceMgr,
        targetDie,
        ships,
    );
    ships.set(targetObj.id, targetMgr);

    // Set signals to MAX power so job timing matches test expectations
    shipMgr.state.signals.power = PowerLevel.MAX;
    // Flush entities so ships are in state before first update
    spaceMgr.forceFlushEntities();
    if (targetScanLevel !== ScanLevel.UFO) {
        spaceMgr.factionIntel.setScanLevel(targetObj.id, shipObj.faction, targetScanLevel);
    }
    // Warmup tick to establish radar range and FOV
    const warmupId = { deltaSeconds: 0.05, deltaSecondsAvg: 0.05, totalSeconds: 0.05 };
    shipMgr.update(warmupId);
    targetMgr.update(warmupId);
    spaceMgr.update(warmupId);

    return { spaceMgr, shipObj, shipMgr, die, targetObj, targetMgr, targetDie, ships };
}

function scanJobs(shipMgr: ShipManagerPc) {
    return shipMgr.state.signals.jobs;
}

function tick(spaceMgr: SpaceManager, deltaSeconds: number, totalSeconds: number, ...shipMgrs: ShipManagerPc[]) {
    const id = { deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds };
    for (const shipMgr of shipMgrs) {
        shipMgr.update(id);
    }
    spaceMgr.update(id);
}

function runTicks(
    spaceMgr: SpaceManager,
    durationSeconds: number,
    ticksPerSecond: number,
    startTotalSeconds: number,
    ...shipMgrs: ShipManagerPc[]
) {
    const iterations = Math.ceil(durationSeconds * ticksPerSecond);
    const dt = durationSeconds / iterations;
    for (let i = 0; i < iterations; i++) {
        tick(spaceMgr, dt, startTotalSeconds + (i + 1) * dt, ...shipMgrs);
    }
    return startTotalSeconds + durationSeconds;
}

// The queue only ever fills from auto-created scan jobs, so seed contacts to fill it.
function fillQueueWithRocks(spaceMgr: SpaceManager, count: number) {
    for (let i = 0; i < count; i++) {
        spaceMgr.insert(new Asteroid().init(`rock${i}`, Vec2.make({ x: 100 * (i + 1), y: 500 }), 10));
    }
    spaceMgr.forceFlushEntities();
}

describe('SignalsJobManager', () => {
    describe('auto-managed scan jobs', () => {
        it('auto-creates a scan job for a visible contact below FULL, active immediately', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            tick(spaceMgr, 0.05, 0.1, shipMgr);

            const jobs = scanJobs(shipMgr);
            expect(jobs.length).to.equal(1);
            expect(jobs[0].targetId).to.equal('target1');
            expect(jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
        });

        it('does not create a scan job for a target already at FULL', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.FULL);
            tick(spaceMgr, 0.05, 0.1, shipMgr);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        // Regression coverage for issue #2022: pause keeps the loop running at deltaSeconds=0,
        // so auto-discovery (unconditional, not time-scaled like the rest of this manager) must
        // be gated explicitly or crew "notice" new contacts while the simulation is frozen.
        it('does not auto-create a scan job while paused (deltaSeconds=0)', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            // the warmup tick in shipWithContactInSight already discovers the visible target; drop it
            // to pin the "not yet discovered" state a paused tick must not re-discover it from
            shipMgr.state.signals.jobs.splice(0);

            tick(spaceMgr, 0, 0.1, shipMgr);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('does not duplicate the scan job for a target', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            runTicks(spaceMgr, 1, 20, 0.05, shipMgr);

            expect(scanJobs(shipMgr).length).to.equal(1);
        });

        it('drops the scan job when the target leaves the field of view', () => {
            const { shipMgr, spaceMgr, targetObj } = shipWithContactInSight();
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            expect(scanJobs(shipMgr).length).to.equal(1);

            targetObj.position.x = 100_000;
            tick(spaceMgr, 0.05, 0.15, shipMgr);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('climbs the ladder passively: UFO -> BASIC -> FULL, 5 seconds of unbroken sight per tier', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();

            runTicks(spaceMgr, 4.5, 20, 0.05, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            runTicks(spaceMgr, 1.5, 20, 4.55, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);

            runTicks(spaceMgr, 6, 20, 6.05, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.FULL);
            // at FULL there is nothing left to scan
            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('re-promotes a SNAPSHOT target back to FULL after 5 seconds of sight', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.SNAPSHOT);

            runTicks(spaceMgr, 6, 20, 0.05, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.FULL);
        });

        it('promotion is deterministic — succeeds even on the worst die roll', () => {
            const { shipMgr, spaceMgr, die } = shipWithContactInSight();
            die.expectedRoll = 0.99;

            runTicks(spaceMgr, 6, 20, 0.05, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });

        it('losing sight resets scan progress — promotion needs 5 fresh seconds after re-entry', () => {
            const { shipMgr, spaceMgr, targetObj } = shipWithContactInSight();

            let t = runTicks(spaceMgr, 3, 20, 0.05, shipMgr);
            targetObj.position.x = 100_000;
            t = runTicks(spaceMgr, 0.5, 20, t, shipMgr);
            expect(shipMgr.state.signals.jobs.length).to.equal(0);

            targetObj.position.x = 1000;
            t = runTicks(spaceMgr, 4, 20, t, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            runTicks(spaceMgr, 2, 20, t, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });

        it('scans non-ship contacts to BASIC and no further — a rock has no systems to reveal', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.FULL);
            const rock = new Asteroid().init('rock1', Vec2.make({ x: 0, y: 1000 }), 10);
            spaceMgr.insert(rock);
            spaceMgr.forceFlushEntities();

            runTicks(spaceMgr, 12, 20, 0.05, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('rock1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
            // and it gives up its queue slot instead of burning tiers that reveal nothing
            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('never creates a scan job for an explosion — transient blast effects are not sensor contacts', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.FULL);
            const blast = new Explosion().init('blast1', Vec2.make({ x: 0, y: 1000 }), 20);
            // radar detectability scales with radius; a fresh explosion's default (0.01) would be
            // undetectable regardless of type, which would make this test pass for the wrong reason
            blast.radius = 200;
            spaceMgr.insert(blast);
            spaceMgr.forceFlushEntities();

            // a single tick, matching the "active immediately" case above — the explosion's default
            // 0.5s lifetime would otherwise expire mid-test and drop any job for the wrong reason
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            expect(scanJobs(shipMgr).map((j) => j.targetId)).to.not.include('blast1');
        });

        it('never creates a scan job for a cannon shell — only missiles are worth scanning (issue #2142)', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.FULL);
            const shell = new Projectile('HiExpShell').init('shell1', Vec2.make({ x: 0, y: 1000 }));
            shell.radius = 200;
            spaceMgr.insert(shell);
            spaceMgr.forceFlushEntities();

            tick(spaceMgr, 0.05, 0.1, shipMgr);
            expect(scanJobs(shipMgr).map((j) => j.targetId)).to.not.include('shell1');
        });

        it('creates a scan job for a missile — scanning it is important gameplay (issue #2142)', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.FULL);
            const missile = new Projectile('HiExpMissile').init('missile1', Vec2.make({ x: 0, y: 1000 }));
            missile.radius = 200;
            spaceMgr.insert(missile);
            spaceMgr.forceFlushEntities();

            tick(spaceMgr, 0.05, 0.1, shipMgr);
            expect(scanJobs(shipMgr).map((j) => j.targetId)).to.include('missile1');
        });

        it('scans a derelict to BASIC and no further, keeping its identity (issue #2111)', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.FULL);
            const derelict = new Derelict().init(
                'hulk1',
                Vec2.make({ x: 0, y: 1000 }),
                10,
                Faction.Raiders,
                'Wreck',
                0,
            );
            spaceMgr.insert(derelict);
            spaceMgr.forceFlushEntities();

            runTicks(spaceMgr, 12, 20, 0.05, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('hulk1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
            // and it gives up its queue slot instead of burning tiers that reveal nothing
            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('does not let a field of rocks hold the queue — every slot frees up once identified', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            fillQueueWithRocks(spaceMgr, 3);

            runTicks(spaceMgr, 30, 20, 0.05, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.FULL);
            expect(scanJobs(shipMgr).length).to.equal(0);
        });
    });

    describe('dormant jobs', () => {
        it('marks a job whose target is out of sight DORMANT, so no client calls it next up', () => {
            const { shipMgr, spaceMgr, targetObj } = shipWithContactInSight();
            const rock = new Asteroid().init('rock1', Vec2.make({ x: 0, y: 1000 }), 10);
            spaceMgr.insert(rock);
            spaceMgr.forceFlushEntities();
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            tick(spaceMgr, 0.05, 0.15, shipMgr);

            const job = scanJobs(shipMgr).find((j) => j.targetId === 'target1');
            shipMgr.state.signals.prioritizeJobId = job?.id ?? '';
            tick(spaceMgr, 0.05, 0.2, shipMgr);
            targetObj.position.x = 100_000;
            tick(spaceMgr, 0.05, 0.25, shipMgr);

            expect(scanJobs(shipMgr)[0].targetId).to.equal('target1');
            expect(scanJobs(shipMgr)[0].status).to.equal(JobStatus.DORMANT);
            expect(scanJobs(shipMgr)[1].status).to.equal(JobStatus.IN_PROGRESS);
        });
    });

    describe('cancelJob', () => {
        it('cancelling the active job activates the next one and re-queues the cancelled job at the back', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            const rock = new Asteroid().init('rock1', Vec2.make({ x: 0, y: 1000 }), 10);
            spaceMgr.insert(rock);
            spaceMgr.forceFlushEntities();
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            tick(spaceMgr, 0.05, 0.15, shipMgr);
            expect(shipMgr.state.signals.jobs.map((job) => job.targetId)).to.deep.equal(['target1', 'rock1']);

            shipMgr.state.signals.cancelJobId = shipMgr.state.signals.jobs[0].id;
            tick(spaceMgr, 0.05, 0.2, shipMgr);

            // rock1 takes over; target1's scan re-enters at the end of the queue with fresh progress
            expect(shipMgr.state.signals.jobs.map((job) => job.targetId)).to.deep.equal(['rock1', 'target1']);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
            expect(shipMgr.state.signals.jobs[1].status).to.equal(JobStatus.QUEUED);
            expect(shipMgr.state.signals.jobs[1].progress).to.equal(0);
        });

        it('cancelling a job whose target is out of sight leaves the queue empty', () => {
            const { shipMgr, spaceMgr, targetObj } = shipWithContactInSight();
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            expect(scanJobs(shipMgr).length).to.equal(1);

            targetObj.position.x = 100_000;
            shipMgr.state.signals.cancelJobId = shipMgr.state.signals.jobs[0].id;
            tick(spaceMgr, 0.05, 0.15, shipMgr);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });
    });

    describe('prioritizeJob', () => {
        it('moves a queued job to the top and makes it the active job', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            const rock = new Asteroid().init('rock1', Vec2.make({ x: 0, y: 1000 }), 10);
            spaceMgr.insert(rock);
            spaceMgr.forceFlushEntities();
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            tick(spaceMgr, 0.05, 0.15, shipMgr);

            const rockJob = scanJobs(shipMgr).find((job) => job.targetId === 'rock1');
            expect(rockJob?.status).to.equal(JobStatus.QUEUED);

            shipMgr.state.signals.prioritizeJobId = rockJob?.id ?? '';
            tick(spaceMgr, 0.05, 0.2, shipMgr);

            expect(shipMgr.state.signals.jobs[0].targetId).to.equal('rock1');
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
            expect(shipMgr.state.signals.jobs[1].targetId).to.equal('target1');
            expect(shipMgr.state.signals.jobs[1].status).to.equal(JobStatus.QUEUED);
        });
    });

    describe('prioritized jobs', () => {
        function setupWithRock() {
            const setup = shipWithContactInSight();
            const rock = new Asteroid().init('rock1', Vec2.make({ x: 0, y: 1000 }), 10);
            setup.spaceMgr.insert(rock);
            setup.spaceMgr.forceFlushEntities();
            tick(setup.spaceMgr, 0.05, 0.1, setup.shipMgr);
            tick(setup.spaceMgr, 0.05, 0.15, setup.shipMgr);
            return { ...setup, rock };
        }

        function prioritize(shipMgr: ShipManagerPc, spaceMgr: SpaceManager, targetId: string, totalSeconds: number) {
            const job = scanJobs(shipMgr).find((j) => j.targetId === targetId);
            shipMgr.state.signals.prioritizeJobId = job?.id ?? '';
            tick(spaceMgr, 0.05, totalSeconds, shipMgr);
        }

        it('prioritizing on top of a prioritized job keeps its place but resets its progress', () => {
            const { shipMgr, spaceMgr } = setupWithRock();

            prioritize(shipMgr, spaceMgr, 'target1', 0.2);
            runTicks(spaceMgr, 2, 20, 0.2, shipMgr);
            expect(shipMgr.state.signals.jobs[0].targetId).to.equal('target1');
            expect(shipMgr.state.signals.jobs[0].progress).to.be.greaterThan(0);

            prioritize(shipMgr, spaceMgr, 'rock1', 2.25);

            expect(shipMgr.state.signals.jobs[0].targetId).to.equal('rock1');
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
            expect(shipMgr.state.signals.jobs[1].targetId).to.equal('target1');
            expect(shipMgr.state.signals.jobs[1].status).to.equal(JobStatus.QUEUED);
            expect(shipMgr.state.signals.jobs[1].progress).to.equal(0);
        });

        it('prioritized jobs survive sight loss dormant and resume in the same order', () => {
            const { shipMgr, spaceMgr, targetObj, rock } = setupWithRock();

            prioritize(shipMgr, spaceMgr, 'rock1', 0.2);
            prioritize(shipMgr, spaceMgr, 'target1', 0.25);
            expect(shipMgr.state.signals.jobs.map((j) => j.targetId)).to.deep.equal(['target1', 'rock1']);

            targetObj.position.x = 100_000;
            rock.position.y = 100_000;
            const t = runTicks(spaceMgr, 1, 20, 0.25, shipMgr);

            // both jobs lie dormant, in place
            expect(shipMgr.state.signals.jobs.map((j) => j.targetId)).to.deep.equal(['target1', 'rock1']);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.DORMANT);
            expect(shipMgr.state.signals.jobs[1].status).to.equal(JobStatus.DORMANT);

            targetObj.position.x = 1000;
            rock.position.y = 1000;
            runTicks(spaceMgr, 0.5, 20, t, shipMgr);

            expect(shipMgr.state.signals.jobs.map((j) => j.targetId)).to.deep.equal(['target1', 'rock1']);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
        });

        it('a dormant prioritized job does not block later jobs', () => {
            const { shipMgr, spaceMgr, rock } = setupWithRock();

            prioritize(shipMgr, spaceMgr, 'rock1', 0.2);
            rock.position.y = 100_000;
            runTicks(spaceMgr, 6, 20, 0.25, shipMgr);

            // the dormant rock job holds its place at the top while the target1 scan works
            expect(shipMgr.state.signals.jobs[0].targetId).to.equal('rock1');
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.DORMANT);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });

        it('a prioritized scan is a standing order: it survives promotion and resumes on demotion', () => {
            const { shipMgr, spaceMgr, targetObj } = shipWithContactInSight(ScanLevel.SNAPSHOT);
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            prioritize(shipMgr, spaceMgr, 'target1', 0.15);

            let t = runTicks(spaceMgr, 6, 20, 0.15, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.FULL);
            expect(scanJobs(shipMgr).map((j) => j.targetId)).to.deep.equal(['target1']);
            expect(scanJobs(shipMgr)[0].status).to.equal(JobStatus.DORMANT);
            expect(scanJobs(shipMgr)[0].progress).to.equal(0);

            // sight loss demotes FULL -> SNAPSHOT, and the standing order picks the scan back up
            targetObj.position.x = 100_000;
            t = runTicks(spaceMgr, 0.5, 20, t, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.SNAPSHOT);

            targetObj.position.x = 1000;
            runTicks(spaceMgr, 0.5, 20, t, shipMgr);
            expect(scanJobs(shipMgr)[0].status).to.equal(JobStatus.IN_PROGRESS);
        });

        it('a standing order ends when its target is destroyed', () => {
            const { shipMgr, spaceMgr, targetObj } = shipWithContactInSight();
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            prioritize(shipMgr, spaceMgr, 'target1', 0.15);

            targetObj.destroyed = true;
            runTicks(spaceMgr, 0.5, 20, 0.15, shipMgr);
            expect(scanJobs(shipMgr).length).to.equal(0);
        });

        it('a standing order on a rock ends when the rock reaches BASIC', () => {
            const { shipMgr, spaceMgr } = setupWithRock();

            prioritize(shipMgr, spaceMgr, 'rock1', 0.2);
            runTicks(spaceMgr, 6, 20, 0.2, shipMgr);

            expect(scanJobs(shipMgr).map((j) => j.targetId)).to.deep.equal(['target1']);
        });
    });

    describe('pause', () => {
        it('jobsPaused halts all job progress until cleared', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            tick(spaceMgr, 0.05, 0.1, shipMgr);

            shipMgr.state.signals.jobsPaused = true;
            const progressBefore = shipMgr.state.signals.jobs[0].progress;
            runTicks(spaceMgr, 3, 20, 0.1, shipMgr);
            expect(shipMgr.state.signals.jobs[0].progress).to.equal(progressBefore);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            shipMgr.state.signals.jobsPaused = false;
            runTicks(spaceMgr, 6, 20, 3.1, shipMgr);
            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });
    });

    describe('job execution', () => {
        it('advances progress over time', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            tick(spaceMgr, 0.05, 0.1, shipMgr);

            const initialProgress = shipMgr.state.signals.jobs[0].progress;
            runTicks(spaceMgr, 2, 20, 0.1, shipMgr);

            expect(shipMgr.state.signals.jobs[0].progress).to.be.greaterThan(initialProgress);
        });
    });

    // Nothing in modules/ writes `hacked` any more — it is kept so a GM can compromise a system by
    // hand for a scripted event. The job pipeline must leave that value alone.
    describe('hacked systems', () => {
        it('leaves a hand-set hack level untouched while jobs run', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            shipMgr.state.radars[0].hacked = HackLevel.COMPROMISED;

            runTicks(spaceMgr, 6, 20, 0.05, shipMgr);

            expect(spaceMgr.factionIntel.getScanLevel('target1', Faction.Gravitas), 'the job still ran').to.equal(
                ScanLevel.BASIC,
            );
            expect(shipMgr.state.radars[0].hacked).to.equal(HackLevel.COMPROMISED);
        });

        it('does not clear a hack level on the target of a job', () => {
            const { shipMgr, spaceMgr, targetMgr } = shipWithContactInSight();
            targetMgr.state.radars[0].hacked = HackLevel.COMPROMISED;

            runTicks(spaceMgr, 6, 20, 0.05, shipMgr);

            expect(targetMgr.state.radars[0].hacked).to.equal(HackLevel.COMPROMISED);
        });
    });

    describe('malfunction effects', () => {
        it('slows job progress when effectiveness is reduced', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            const normalDuration = shipMgr.state.signals.jobs[0].duration;

            shipMgr.state.signals.power = 0.5;

            const progressBefore = shipMgr.state.signals.jobs[0].progress;
            tick(spaceMgr, 1, 1.1, shipMgr);
            const progressAfter = shipMgr.state.signals.jobs[0].progress;

            const progressPerSecond = progressAfter - progressBefore;
            const expectedProgressPerSecond = 1 / (normalDuration / 0.5);
            expect(progressPerSecond).to.be.closeTo(expectedProgressPerSecond, 0.01);
        });

        it('reduces max queue size when damaged', () => {
            const { shipMgr } = shipWithContactInSight();

            expect(shipMgr.state.signals.currentMaxJobs).to.equal(9);

            shipMgr.state.signals.jobSuccessFactor = 0.5;
            shipMgr.state.signals.jobSpeedFactor = 0.5;

            expect(shipMgr.state.signals.currentMaxJobs).to.equal(3);
        });

        it('halts progress when effectiveness is zero', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight();
            tick(spaceMgr, 0.05, 0.1, shipMgr);

            expect(shipMgr.state.signals.jobs.length).to.equal(1);

            shipMgr.state.signals.power = 0;

            const progressBefore = shipMgr.state.signals.jobs[0].progress;
            tick(spaceMgr, 3, 3.1, shipMgr);
            const progressAfter = shipMgr.state.signals.jobs[0].progress;

            expect(progressAfter).to.equal(progressBefore);
        });

        it('trims excess jobs when max queue decreases', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.FULL);

            fillQueueWithRocks(spaceMgr, 5);
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            expect(shipMgr.state.signals.jobs.length).to.equal(5);

            shipMgr.state.signals.jobSuccessFactor = 0.3;
            shipMgr.state.signals.jobSpeedFactor = 0.3;
            expect(shipMgr.state.signals.currentMaxJobs).to.equal(1);

            tick(spaceMgr, 0.05, 0.2, shipMgr);

            expect(shipMgr.state.signals.jobs.length).to.be.at.most(1);
        });

        it('trimming evicts non-prioritized jobs before prioritized ones', () => {
            const { shipMgr, spaceMgr } = shipWithContactInSight(ScanLevel.FULL);

            fillQueueWithRocks(spaceMgr, 5);
            tick(spaceMgr, 0.05, 0.1, shipMgr);
            const prioritizedJob = shipMgr.state.signals.jobs[2];
            shipMgr.state.signals.prioritizeJobId = prioritizedJob.id;
            tick(spaceMgr, 0.05, 0.2, shipMgr);

            shipMgr.state.signals.jobSuccessFactor = 0.3;
            shipMgr.state.signals.jobSpeedFactor = 0.3;
            tick(spaceMgr, 0.05, 0.25, shipMgr);

            expect(shipMgr.state.signals.jobs.length).to.equal(1);
            expect(shipMgr.state.signals.jobs[0].id).to.equal(prioritizedJob.id);
        });
    });
});
