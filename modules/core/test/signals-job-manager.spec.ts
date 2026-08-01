import {
    Faction,
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
import { JobStatus, SignalsJob } from '../src/ship/signals-job';

import { MockDie } from './ship-test-harness';
import { ShipManager } from '../src/ship/ship-manager-abstract';
import { expect } from 'chai';
import { makeId } from '../src/id';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

function createTestSetup() {
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
    // Warmup tick to establish radar range and FOV
    const warmupId = { deltaSeconds: 0.05, deltaSecondsAvg: 0.05, totalSeconds: 0.05 };
    shipMgr.update(warmupId);
    targetMgr.update(warmupId);
    spaceMgr.update(warmupId);

    return { spaceMgr, shipObj, shipMgr, die, targetObj, targetMgr, targetDie, ships };
}

/**
 * The queue has no client-facing submission command; jobs are seeded by whatever produces them.
 * These tests stand in for that producer: push a job and, when it is the only one, start it.
 */
function seedJob(shipMgr: ShipManagerPc, targetId: string) {
    const job = new SignalsJob();
    job.id = makeId();
    job.targetId = targetId;
    job.status = shipMgr.state.signals.jobs.length === 0 ? JobStatus.IN_PROGRESS : JobStatus.QUEUED;
    job.progress = 0;
    job.duration = shipMgr.state.signals.design.scanBaseDuration;
    shipMgr.state.signals.jobs.push(job);
    return job;
}

function tick(shipMgr: ShipManagerPc, spaceMgr: SpaceManager, deltaSeconds: number, totalSeconds: number) {
    const id = { deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds };
    shipMgr.update(id);
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

describe('SignalsJobManager', () => {
    describe('cancelJob', () => {
        it('should remove a queued job by id', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            seedJob(shipMgr, 'target1');
            const secondJob = seedJob(shipMgr, 'target1');

            shipMgr.state.signals.cancelJobId = secondJob.id;
            tick(shipMgr, spaceMgr, 0.05, 0.15);

            expect(shipMgr.state.signals.jobs.length).to.equal(1);
        });

        it('should promote next job when active job is cancelled', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            const activeJob = seedJob(shipMgr, 'target1');
            seedJob(shipMgr, 'target1');

            shipMgr.state.signals.cancelJobId = activeJob.id;
            tick(shipMgr, spaceMgr, 0.05, 0.15);

            expect(shipMgr.state.signals.jobs.length).to.equal(1);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
        });
    });

    describe('job execution', () => {
        it('should advance progress over time', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            seedJob(shipMgr, 'target1');
            const initialProgress = shipMgr.state.signals.jobs[0].progress;

            runTicks(shipMgr, spaceMgr, 5, 20, 0.05);

            expect(shipMgr.state.signals.jobs[0].progress).to.be.greaterThan(initialProgress);
        });

        it('should complete job and start next in queue', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            seedJob(shipMgr, 'target1');
            seedJob(shipMgr, 'target1');
            expect(shipMgr.state.signals.jobs.length).to.equal(2);

            runTicks(shipMgr, spaceMgr, 25, 20, 0.1);

            expect(shipMgr.state.signals.jobs.length).to.equal(1);
            expect(shipMgr.state.signals.jobs[0].status).to.equal(JobStatus.IN_PROGRESS);
        });

        it('should remove job if target moves out of range', () => {
            const { shipMgr, spaceMgr, targetObj } = createTestSetup();

            seedJob(shipMgr, 'target1');
            expect(shipMgr.state.signals.jobs.length).to.equal(1);

            targetObj.position.x = 100_000;
            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(shipMgr.state.signals.jobs.length).to.equal(0);
        });
    });

    // A scan job takes `scanBaseDuration` (20s) at best, while a contact in range self-promotes
    // UFO -> BASIC after TIER1_DWELL_SECONDS (5s), so only the BASIC -> ADVANCED tier is reachable
    // by a job. These cases start from BASIC, where passive promotion no longer applies.
    describe('scan job effects', () => {
        it('should upgrade scan level BASIC -> ADVANCED on completion', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            spaceMgr.setScanLevel('target1', Faction.Gravitas, ScanLevel.BASIC);

            seedJob(shipMgr, 'target1');
            runTicks(shipMgr, spaceMgr, 45, 20, 0.05);

            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.ADVANCED);
        });

        it('should upgrade scan level regardless of the die, as completion is deterministic', () => {
            const { shipMgr, spaceMgr, die } = createTestSetup();
            die.expectedRoll = 0.99;

            spaceMgr.setScanLevel('target1', Faction.Gravitas, ScanLevel.BASIC);

            seedJob(shipMgr, 'target1');
            runTicks(shipMgr, spaceMgr, 45, 20, 0.05);

            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.ADVANCED);
        });
    });

    describe('malfunction effects', () => {
        it('should slow job progress when effectiveness is reduced', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            const job = seedJob(shipMgr, 'target1');
            const normalDuration = job.duration;

            shipMgr.state.signals.power = 0.5;

            const progressBefore = shipMgr.state.signals.jobs[0].progress;
            tick(shipMgr, spaceMgr, 1, 1.05);
            const progressAfter = shipMgr.state.signals.jobs[0].progress;

            const progressPerSecond = progressAfter - progressBefore;
            const expectedProgressPerSecond = 1 / (normalDuration / 0.5);
            expect(progressPerSecond).to.be.closeTo(expectedProgressPerSecond, 0.01);
        });

        it('should reduce max queue size when damaged', () => {
            const { shipMgr } = createTestSetup();

            expect(shipMgr.state.signals.currentMaxJobs).to.equal(9);

            shipMgr.state.signals.jobSuccessFactor = 0.5;
            shipMgr.state.signals.jobSpeedFactor = 0.5;

            expect(shipMgr.state.signals.currentMaxJobs).to.equal(3);
        });

        it('should halt progress when effectiveness is zero', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            seedJob(shipMgr, 'target1');
            expect(shipMgr.state.signals.jobs.length).to.equal(1);

            shipMgr.state.signals.power = 0;

            const progressBefore = shipMgr.state.signals.jobs[0].progress;
            tick(shipMgr, spaceMgr, 5, 5.1);
            const progressAfter = shipMgr.state.signals.jobs[0].progress;

            expect(progressAfter).to.equal(progressBefore);
        });

        it('should trim excess jobs when max queue decreases', () => {
            const { shipMgr, spaceMgr } = createTestSetup();

            for (let i = 0; i < 5; i++) {
                seedJob(shipMgr, 'target1');
            }
            expect(shipMgr.state.signals.jobs.length).to.equal(5);

            shipMgr.state.signals.jobSuccessFactor = 0.3;
            shipMgr.state.signals.jobSpeedFactor = 0.3;
            expect(shipMgr.state.signals.currentMaxJobs).to.equal(1);

            tick(shipMgr, spaceMgr, 0.05, 0.1);

            expect(shipMgr.state.signals.jobs.length).to.be.at.most(1);
        });
    });

    describe('tier-1 passive scan promotion', () => {
        it('promotes UFO contact to BASIC after 5 continuous seconds in range', () => {
            const { shipMgr, spaceMgr } = createTestSetup();
            // target1 is at (1000, 0), inside the omni sector's 10,000 reach
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            // 4.9 seconds in range – not yet promoted
            runTicks(shipMgr, spaceMgr, 4.9, 20, 0.05);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            // 0.2 more seconds – crosses 5-second threshold
            runTicks(shipMgr, spaceMgr, 0.2, 20, 4.95);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });

        it('resets dwell timer when contact leaves range', () => {
            const { shipMgr, spaceMgr, targetObj } = createTestSetup();

            // 3 seconds in range – timer at 3, not yet promoted
            runTicks(shipMgr, spaceMgr, 3, 20, 0.05);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            // move out of range – timer resets
            targetObj.position.x = 20000;
            tick(shipMgr, spaceMgr, 0.1, 3.15);

            // move back in range
            targetObj.position.x = 1000;

            // 4.9 seconds since re-entry – timer reset, not yet promoted
            runTicks(shipMgr, spaceMgr, 4.9, 20, 3.25);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.UFO);

            // 0.2 more seconds – completes 5 seconds of continuous in-range dwell
            runTicks(shipMgr, spaceMgr, 0.2, 20, 8.15);
            expect(spaceMgr.getScanLevel('target1', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });
    });
});
