import {
    Asteroid,
    Faction,
    HackLevel,
    PowerLevel,
    ScanLevel,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    makeShipState,
    shipConfigurations,
} from '../src';
import { JobStatus, JobType } from '../src/ship/signals-job';

import { MockDie } from './ship-test-harness';
import { ShipManager } from '../src/ship/ship-manager-abstract';
import { expect } from 'chai';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

function createTestSetup(targetScanLevel: ScanLevel = ScanLevel.UFO) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'ship1';
    shipObj.faction = Faction.Gravitas;
    const die = new MockDie();
    const ships = new Map<string, ShipManager>();
    const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, dragonflyConfig), spaceMgr, die, ships);
    ships.set(shipObj.id, shipMgr);
    spaceMgr.insert(shipObj);
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
    shipMgr.state.signals.power = PowerLevel.MAX;

    // Create a target ship within radar range
    const targetObj = new Spaceship();
    targetObj.id = 'target1';
    targetObj.faction = Faction.Raiders;
    targetObj.position = Vec2.make({ x: 1000, y: 0 });
    spaceMgr.insert(targetObj);
    const targetDie = new MockDie();
    const targetMgr = new ShipManagerPc(
        targetObj,
        makeShipState(targetObj.id, dragonflyConfig),
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
        spaceMgr.setScanLevel(targetObj.id, shipObj.faction, targetScanLevel);
    }
    // Warmup tick to establish radar range and FOV
    const warmupId = { deltaSeconds: 0.05, deltaSecondsAvg: 0.05, totalSeconds: 0.05 };
    shipMgr.update(warmupId);
    targetMgr.update(warmupId);
    spaceMgr.update(warmupId);

    return { spaceMgr, shipObj, shipMgr, die, targetObj, targetMgr, targetDie, ships };
}

function submitHackJob(shipMgr: ShipManagerPc, targetId: string, hackSystemName: string) {
    shipMgr.state.signals.queueJobTargetId = targetId;
    shipMgr.state.signals.queueJobHackSystemName = hackSystemName;
    shipMgr.state.signals.submitJobCommand = true;
}

function scanJobs(shipMgr: ShipManagerPc) {
    return [...shipMgr.state.signals.jobs].filter((job) => job.jobType === JobType.SCAN);
}

function hackJobs(shipMgr: ShipManagerPc) {
    return [...shipMgr.state.signals.jobs].filter((job) => job.jobType === JobType.HACK);
}

function tick(shipMgr: ShipManagerPc, spaceMgr: SpaceManager, deltaSeconds: number, totalSeconds: number) {
    const id = { deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds };
    shipMgr.update(id);
    spaceMgr.update(id);
}

function tickBoth(
    shipMgr: ShipManagerPc,
    targetMgr: ShipManagerPc,
    spaceMgr: SpaceManager,
    deltaSeconds: number,
    totalSeconds: number,
) {
    const id = { deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds };
    shipMgr.update(id);
    targetMgr.update(id);
    spaceMgr.update(id);
}

function runTicks(
    shipMgr: ShipManagerPc,
    spaceMgr: SpaceManager,
    durationSeconds: number,
    ticksPerSecond: number,
    startTotalSeconds = 0,
) {
    const iterations = Math.ceil(durationSeconds * ticksPerSecond);
    const dt = durationSeconds / iterations;
    for (let i = 0; i < iterations; i++) {
        const totalSeconds = startTotalSeconds + (i + 1) * dt;
        tick(shipMgr, spaceMgr, dt, totalSeconds);
    }
    return startTotalSeconds + durationSeconds;
}

function runTicksBoth(
    shipMgr: ShipManagerPc,
    targetMgr: ShipManagerPc,
    spaceMgr: SpaceManager,
    durationSeconds: number,
    ticksPerSecond: number,
    startTotalSeconds = 0,
) {
    const iterations = Math.ceil(durationSeconds * ticksPerSecond);
    const dt = durationSeconds / iterations;
    for (let i = 0; i < iterations; i++) {
        const totalSeconds = startTotalSeconds + (i + 1) * dt;
        tickBoth(shipMgr, targetMgr, spaceMgr, dt, totalSeconds);
    }
    return startTotalSeconds + durationSeconds;
}

describe('SignalsJobManager', () => {
    describe('auto-managed scan jobs', () => {
        it('auto-creates a scan job for a visible contact below FULL, active immediately', () => {
            const { shipMgr, spaceMgr } = createTestSetup();
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            const jobs = scanJobs(shipMgr);
            expect(jobs.length).to.equal(1);
            expect(jobs[0].targetId).to.equal('target1');
            expect(jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
        });

        it('does not create a scan job for a target already at FULL', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.FULL);
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('does not duplicate the scan job for a target', () => {
            const { shipMgr, spaceMgr } = createTestSetup();
            runTicks(shipMgr, spaceMgr, 1, 20, 0.05);

            expect(scanJobs(shipMgr).length).to.equal(1);
        });

        it('drops the scan job when the target leaves the field of view', () => {
            const { shipMgr, spaceMgr, targetObj } = createTestSetup();
            tick(shipMgr, spaceMgr, 0.05, 0.1);
            expect(scanJobs(shipMgr).length).to.equal(1);

            targetObj.position.x = 100_000;
            tick(shipMgr, spaceMgr, 0.05, 0.15);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('climbs the ladder passively: UFO -> BASIC -> FULL, 5 seconds of unbroken sight per tier', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            runTicks(shipMgr, spaceMgr, 4.5, 20, 0.05);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            runTicks(shipMgr, spaceMgr, 1.5, 20, 4.55);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);

            runTicks(shipMgr, spaceMgr, 6, 20, 6.05);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.FULL);
            // at FULL there is nothing left to scan
            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('re-promotes a SNAPSHOT target back to FULL after 5 seconds of sight', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.SNAPSHOT);

            runTicks(shipMgr, spaceMgr, 6, 20, 0.05);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.FULL);
        });

        it('promotion is deterministic — succeeds even on the worst die roll', () => {
            const { shipMgr, spaceMgr, die } = createTestSetup();
            die.expectedRoll = 0.99;

            runTicks(shipMgr, spaceMgr, 6, 20, 0.05);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });

        it('losing sight resets scan progress — promotion needs 5 fresh seconds after re-entry', () => {
            const { shipMgr, spaceMgr, targetObj } = createTestSetup();

            let t = runTicks(shipMgr, spaceMgr, 3, 20, 0.05);
            targetObj.position.x = 100_000;
            t = runTicks(shipMgr, spaceMgr, 0.5, 20, t);
            expect(shipMgr.state.signals.jobs.length).to.equal(0);

            targetObj.position.x = 1000;
            t = runTicks(shipMgr, spaceMgr, 4, 20, t);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            runTicks(shipMgr, spaceMgr, 2, 20, t);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });

        it('scans non-ship contacts too', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.FULL);
            const rock = new Asteroid().init('rock1', Vec2.make({ x: 0, y: 1000 }), 10);
            spaceMgr.insert(rock);
            spaceMgr.forceFlushEntities();

            runTicks(shipMgr, spaceMgr, 6, 20, 0.05);
            expect(spaceMgr.getScanLevel('rock1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });
    });

    describe('hack job submission', () => {
        it('queues a hack behind the active scan job', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.SNAPSHOT);
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.15);

            expect(shipMgr.state.signals.jobs.length).to.equal(2);
            expect(shipMgr.state.signals.jobs[0].jobType).to.equal(JobType.SCAN);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
            expect(shipMgr.state.signals.jobs[1].jobType).to.equal(JobType.HACK);
            expect(shipMgr.state.signals.jobs[1].status).to.equal(JobStatus.QUEUED);
        });

        it('rejects a hack when the queue is full', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.FULL);

            for (let i = 0; i < shipMgr.state.signals.design.maxJobs; i++) {
                submitHackJob(shipMgr, 'target1', 'radars/0');
                tick(shipMgr, spaceMgr, 0.01, 0.1 + 0.01 * (i + 1));
            }
            expect(shipMgr.state.signals.jobs.length).to.equal(9);

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.01, 0.3);

            expect(shipMgr.state.signals.jobs.length).to.equal(9);
        });

        it('rejects a hack on a target that does not exist', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.FULL);

            submitHackJob(shipMgr, 'nonexistent', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });

        it('rejects a hack whose system name has trailing segments', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.SNAPSHOT);

            submitHackJob(shipMgr, 'target1', 'radars/0/hacked');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(hackJobs(shipMgr).length).to.equal(0);
        });

        it('rejects a hack if the target is not at SNAPSHOT+ scan level', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(hackJobs(shipMgr).length).to.equal(0);
        });

        it('accepts a hack when the target is at SNAPSHOT scan level', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.SNAPSHOT);

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(hackJobs(shipMgr).length).to.equal(1);
        });

        it('rejects a hack without a valid system name', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.SNAPSHOT);

            submitHackJob(shipMgr, 'target1', 'invalidSystem');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(hackJobs(shipMgr).length).to.equal(0);
        });

        it('resets command fields after processing', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.FULL);

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(shipMgr.state.signals.submitJobCommand).to.equal(false);
            expect(shipMgr.state.signals.queueJobTargetId).to.equal('');
            expect(shipMgr.state.signals.queueJobHackSystemName).to.equal('');
        });
    });

    describe('cancelJob', () => {
        it('removes a queued hack job by id', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.SNAPSHOT);
            tick(shipMgr, spaceMgr, 0.05, 0.1);
            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.15);
            expect(hackJobs(shipMgr).length).to.equal(1);

            shipMgr.state.signals.cancelJobId = hackJobs(shipMgr)[0].id;
            tick(shipMgr, spaceMgr, 0.05, 0.2);

            expect(hackJobs(shipMgr).length).to.equal(0);
        });

        it('cancelling the active scan job sends it to the back and activates the next job', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.SNAPSHOT);
            tick(shipMgr, spaceMgr, 0.05, 0.1);
            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.15);

            shipMgr.state.signals.cancelJobId = scanJobs(shipMgr)[0].id;
            tick(shipMgr, spaceMgr, 0.05, 0.2);

            // the hack takes over; the scan job re-enters at the end of the queue with fresh progress
            expect(shipMgr.state.signals.jobs[0].jobType).to.equal(JobType.HACK);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
            expect(shipMgr.state.signals.jobs[1].jobType).to.equal(JobType.SCAN);
            expect(shipMgr.state.signals.jobs[1].status).to.equal(JobStatus.QUEUED);
            expect(shipMgr.state.signals.jobs[1].progress).to.equal(0);
        });
    });

    describe('prioritizeJob', () => {
        it('moves a queued job to the top and makes it the active job', () => {
            const { shipMgr, spaceMgr } = createTestSetup();
            const rock = new Asteroid().init('rock1', Vec2.make({ x: 0, y: 1000 }), 10);
            spaceMgr.insert(rock);
            spaceMgr.forceFlushEntities();
            tick(shipMgr, spaceMgr, 0.05, 0.1);
            tick(shipMgr, spaceMgr, 0.05, 0.15);

            const rockJob = scanJobs(shipMgr).find((job) => job.targetId === 'rock1');
            expect(rockJob?.status).to.equal(JobStatus.QUEUED);

            shipMgr.state.signals.prioritizeJobId = rockJob?.id ?? '';
            tick(shipMgr, spaceMgr, 0.05, 0.2);

            expect(shipMgr.state.signals.jobs[0].targetId).to.equal('rock1');
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
            expect(shipMgr.state.signals.jobs[1].targetId).to.equal('target1');
            expect(shipMgr.state.signals.jobs[1].status).to.equal(JobStatus.QUEUED);
        });
    });

    describe('prioritized jobs', () => {
        function setupWithRock() {
            const setup = createTestSetup();
            const rock = new Asteroid().init('rock1', Vec2.make({ x: 0, y: 1000 }), 10);
            setup.spaceMgr.insert(rock);
            setup.spaceMgr.forceFlushEntities();
            tick(setup.shipMgr, setup.spaceMgr, 0.05, 0.1);
            tick(setup.shipMgr, setup.spaceMgr, 0.05, 0.15);
            return { ...setup, rock };
        }

        function prioritize(shipMgr: ShipManagerPc, spaceMgr: SpaceManager, targetId: string, totalSeconds: number) {
            const job = scanJobs(shipMgr).find((j) => j.targetId === targetId);
            shipMgr.state.signals.prioritizeJobId = job?.id ?? '';
            tick(shipMgr, spaceMgr, 0.05, totalSeconds);
        }

        it('prioritizing on top of a prioritized job keeps its place but resets its progress', () => {
            const { shipMgr, spaceMgr } = setupWithRock();

            prioritize(shipMgr, spaceMgr, 'target1', 0.2);
            runTicks(shipMgr, spaceMgr, 2, 20, 0.2);
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
            expect([...shipMgr.state.signals.jobs].map((j) => j.targetId)).to.deep.equal(['target1', 'rock1']);

            targetObj.position.x = 100_000;
            rock.position.y = 100_000;
            const t = runTicks(shipMgr, spaceMgr, 1, 20, 0.25);

            // both jobs lie dormant, in place
            expect([...shipMgr.state.signals.jobs].map((j) => j.targetId)).to.deep.equal(['target1', 'rock1']);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.QUEUED);
            expect(shipMgr.state.signals.jobs[1].status).to.equal(JobStatus.QUEUED);

            targetObj.position.x = 1000;
            rock.position.y = 1000;
            runTicks(shipMgr, spaceMgr, 0.5, 20, t);

            expect([...shipMgr.state.signals.jobs].map((j) => j.targetId)).to.deep.equal(['target1', 'rock1']);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
        });

        it('a dormant prioritized job does not block later jobs', () => {
            const { shipMgr, spaceMgr, rock } = setupWithRock();

            prioritize(shipMgr, spaceMgr, 'rock1', 0.2);
            rock.position.y = 100_000;
            runTicks(shipMgr, spaceMgr, 6, 20, 0.25);

            // the dormant rock job holds its place at the top while the target1 scan works
            expect(shipMgr.state.signals.jobs[0].targetId).to.equal('rock1');
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.QUEUED);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });
    });

    describe('pause', () => {
        it('jobsPaused halts all job progress until cleared', () => {
            const { shipMgr, spaceMgr } = createTestSetup();
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            shipMgr.state.signals.jobsPaused = true;
            const progressBefore = shipMgr.state.signals.jobs[0].progress;
            runTicks(shipMgr, spaceMgr, 3, 20, 0.1);
            expect(shipMgr.state.signals.jobs[0].progress).to.equal(progressBefore);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            shipMgr.state.signals.jobsPaused = false;
            runTicks(shipMgr, spaceMgr, 6, 20, 3.1);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });
    });

    describe('job execution', () => {
        it('advances progress over time', () => {
            const { shipMgr, spaceMgr } = createTestSetup();
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            const initialProgress = shipMgr.state.signals.jobs[0].progress;
            runTicks(shipMgr, spaceMgr, 2, 20, 0.1);

            expect(shipMgr.state.signals.jobs[0].progress).to.be.greaterThan(initialProgress);
        });
    });

    describe('hack job effects', () => {
        it('sets the target system hacked to COMPROMISED on success', () => {
            const { shipMgr, spaceMgr, die, targetMgr } = createTestSetup(ScanLevel.FULL);
            die.expectedRoll = 0;

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            runTicks(shipMgr, spaceMgr, 50, 20, 0.1);

            expect(targetMgr.state.radars[0].hacked).to.equal(HackLevel.COMPROMISED);
        });

        it('expires the hack after hackEffectDuration (managed by victim)', () => {
            const { shipMgr, targetMgr, spaceMgr, die } = createTestSetup(ScanLevel.FULL);
            die.expectedRoll = 0;

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            let t = runTicks(shipMgr, spaceMgr, 50, 20, 0.1);
            expect(targetMgr.state.radars[0].hacked).to.equal(HackLevel.COMPROMISED);

            // Victim's manager should expire the hack
            t = runTicksBoth(shipMgr, targetMgr, spaceMgr, 160, 10, t);

            expect(targetMgr.state.radars[0].hacked).to.equal(HackLevel.OK);
        });

        it('expires the hack even if the attacker ship no longer updates', () => {
            const { shipMgr, targetMgr, spaceMgr, die } = createTestSetup(ScanLevel.FULL);
            die.expectedRoll = 0;

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            const t = runTicks(shipMgr, spaceMgr, 50, 20, 0.1);
            expect(targetMgr.state.radars[0].hacked).to.equal(HackLevel.COMPROMISED);

            // Only tick the TARGET (simulates attacker destroyed/gone)
            const iterations = Math.ceil(160 * 10);
            const dt = 160 / iterations;
            for (let i = 0; i < iterations; i++) {
                const totalSeconds = t + (i + 1) * dt;
                const id = { deltaSeconds: dt, deltaSecondsAvg: dt, totalSeconds };
                targetMgr.update(id);
                spaceMgr.update(id);
            }

            expect(targetMgr.state.radars[0].hacked).to.equal(HackLevel.OK);
        });

        it('does not change the target system on failure', () => {
            const { shipMgr, spaceMgr, die, targetMgr } = createTestSetup(ScanLevel.FULL);
            die.expectedRoll = 0.99;

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            runTicks(shipMgr, spaceMgr, 50, 20, 0.1);

            expect(targetMgr.state.radars[0].hacked).to.equal(HackLevel.OK);
        });

        it('enforces the hack cooldown', () => {
            const { shipMgr, spaceMgr, die } = createTestSetup(ScanLevel.FULL);
            die.expectedRoll = 0;

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, 0.1);
            const t = runTicks(shipMgr, spaceMgr, 50, 20, 0.1);

            submitHackJob(shipMgr, 'target1', 'radars/0');
            tick(shipMgr, spaceMgr, 0.05, t);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });
    });

    describe('malfunction effects', () => {
        it('slows job progress when effectiveness is reduced', () => {
            const { shipMgr, spaceMgr } = createTestSetup();
            tick(shipMgr, spaceMgr, 0.05, 0.1);
            const normalDuration = shipMgr.state.signals.jobs[0].duration;

            shipMgr.state.signals.power = 0.5;

            const progressBefore = shipMgr.state.signals.jobs[0].progress;
            tick(shipMgr, spaceMgr, 1, 1.1);
            const progressAfter = shipMgr.state.signals.jobs[0].progress;

            const progressPerSecond = progressAfter - progressBefore;
            const expectedProgressPerSecond = 1 / (normalDuration / 0.5);
            expect(progressPerSecond).to.be.closeTo(expectedProgressPerSecond, 0.01);
        });

        it('reduces max queue size when damaged', () => {
            const { shipMgr } = createTestSetup();

            expect(shipMgr.state.signals.currentMaxJobs).to.equal(9);

            shipMgr.state.signals.jobSuccessFactor = 0.5;
            shipMgr.state.signals.jobSpeedFactor = 0.5;

            expect(shipMgr.state.signals.currentMaxJobs).to.equal(3);
        });

        it('halts progress when effectiveness is zero', () => {
            const { shipMgr, spaceMgr } = createTestSetup();
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(shipMgr.state.signals.jobs.length).to.equal(1);

            shipMgr.state.signals.power = 0;

            const progressBefore = shipMgr.state.signals.jobs[0].progress;
            tick(shipMgr, spaceMgr, 3, 3.1);
            const progressAfter = shipMgr.state.signals.jobs[0].progress;

            expect(progressAfter).to.equal(progressBefore);
        });

        it('trims excess jobs when max queue decreases', () => {
            const { shipMgr, spaceMgr } = createTestSetup(ScanLevel.FULL);

            for (let i = 0; i < 5; i++) {
                submitHackJob(shipMgr, 'target1', 'radars/0');
                tick(shipMgr, spaceMgr, 0.01, 0.1 + 0.01 * (i + 1));
            }
            expect(shipMgr.state.signals.jobs.length).to.equal(5);

            shipMgr.state.signals.jobSuccessFactor = 0.3;
            shipMgr.state.signals.jobSpeedFactor = 0.3;
            expect(shipMgr.state.signals.currentMaxJobs).to.equal(1);

            tick(shipMgr, spaceMgr, 0.05, 0.2);

            expect(shipMgr.state.signals.jobs.length).to.be.at.most(1);
        });
    });
});
