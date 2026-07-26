import { Asteroid, Faction, JobType, ShipDie, ShipManagerPc, ShipState, Spaceship, Vec2 } from '../src';

import { SpaceSimulator } from './simulator';
import { expect } from 'chai';

/**
 * I3 — range gates honor the unioned radar vision.
 *
 * Each tick the ship manager mirrors the union of the ship's radars onto
 * Spaceship.radarSectors ({ direction: world-bearing deg, arc: deg, range: m }), and
 * Spaceship.maxRadarRange is the widest reach across them. Range gates must honor that union:
 * a target inside a beam sector though beyond the omni radius is IN range / scannable / not-dropped.
 *
 * Scenario shared by all three gates:
 *   scanner at origin, omni range small (1000 m). radars[1] beam aimed down world
 *   bearing 0 with arc 60°, reaching far past the target. A target sits at (3000, 0):
 *   OUTSIDE the omni radius but INSIDE the beam sector.
 */

const OMNI_RANGE = 1000;
const TARGET_DISTANCE = 3000; // beyond omni, inside the beam sector
const BEAM_ARC = 60;
// nominal reach at the fitted arc, comfortably > TARGET_DISTANCE even at partial effectiveness
const BEAM_DESIGN = { range: 20_000, minArc: 5, maxArc: 90, defaultArc: BEAM_ARC };

// Aim radars[0] (omni) short and radars[1] (beam) down world bearing 0 covering the target.
function configureRadars(shipMgr: { state: ShipState }): void {
    const omni = shipMgr.state.radars[0];
    omni.design.range = OMNI_RANGE;

    const beam = shipMgr.state.radars[1];
    beam.design.assign(BEAM_DESIGN);
    beam.arc = BEAM_ARC;
    beam.direction = 0; // ship angle is 0, so ship-relative 0 == world bearing 0 (toward the target)
}

// A scan job is only accepted for a target the ship can see, so the queue is the observable
// stand-in for the private visibility gate.
function queueScanJob(shipMgr: { state: ShipState }, targetId: string): void {
    shipMgr.state.signals.queueJobType = JobType.SCAN;
    shipMgr.state.signals.queueJobTargetId = targetId;
    shipMgr.state.signals.submitJobCommand = true;
}

describe('radar range gates honor the beam (I3)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('isVisible honors the beam: target beyond omni but inside the beam sector is scannable', () => {
        const sim = new SpaceSimulator(10);
        const scanner = new Spaceship();
        scanner.id = 'scanner';
        scanner.faction = Faction.Gravitas;
        scanner.position = Vec2.make({ x: 0, y: 0 });
        const shipMgr = sim.withShip(scanner, new ShipDie(0), ShipManagerPc);
        configureRadars(shipMgr);

        // in-beam target: bearing 0, distance 3000 (beyond omni 1000, inside beam sector)
        const inBeam = new Asteroid();
        inBeam.id = 'in-beam';
        inBeam.position = Vec2.make({ x: TARGET_DISTANCE, y: 0 });

        // out-of-beam target: same distance, bearing 90 — outside the 60°-arc beam AND beyond omni
        const outOfBeam = new Asteroid();
        outOfBeam.id = 'out-of-beam';
        outOfBeam.position = Vec2.make({ x: 0, y: TARGET_DISTANCE });

        sim.withObjects(inBeam, outOfBeam);
        sim.spaceMgr.forceFlushEntities();

        // tick so the manager mirrors radars -> radarSectors and the FieldOfView is (re)computed
        sim.simulateUntilTime(0.3);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(sim.spaceMgr.isVisible(scanner.id, inBeam.id), 'in-beam target should be scannable').to.be.true;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(
            sim.spaceMgr.isVisible(scanner.id, outOfBeam.id),
            'target beyond omni and outside the beam bearing must NOT be scannable',
        ).to.be.false;
    });

    it('signals visibility honors the beam: a scan job is accepted for a target beyond omni but inside the beam', () => {
        // the visibility gate is private; assert its observable consequence — the signals station
        // only accepts a job for a target it can see.
        const sim = new SpaceSimulator(10);
        const scanner = new Spaceship();
        scanner.id = 'scanner';
        scanner.faction = Faction.Gravitas;
        scanner.position = Vec2.make({ x: 0, y: 0 });
        const shipMgr = sim.withShip(scanner, new ShipDie(0), ShipManagerPc);
        configureRadars(shipMgr);

        const target = new Spaceship();
        target.id = 'in-beam-target';
        target.faction = Faction.Raiders;
        target.position = Vec2.make({ x: TARGET_DISTANCE, y: 0 });

        sim.withObjects(target);
        sim.spaceMgr.forceFlushEntities();

        // let sectors populate first
        sim.simulateUntilTime(0.3);

        queueScanJob(shipMgr, target.id);
        sim.simulateUntilTime(0.3);

        expect(
            shipMgr.state.signals.jobs.length,
            'a target beyond omni but inside the beam sector is workable',
        ).to.equal(1);
    });

    it('signals visibility is directional: a target inside maxRadarRange but on an uncovered bearing is rejected', () => {
        // maxRadarRange is the widest reach across sectors, stripped of direction. The beam reaches
        // 20 km down bearing 0, so a contact 3 km off at bearing 90 passes a bare distance test
        // while no sector covers it. Line of sight must reject it.
        const sim = new SpaceSimulator(10);
        const scanner = new Spaceship();
        scanner.id = 'scanner';
        scanner.faction = Faction.Gravitas;
        scanner.position = Vec2.make({ x: 0, y: 0 });
        const shipMgr = sim.withShip(scanner, new ShipDie(0), ShipManagerPc);
        configureRadars(shipMgr);

        const target = new Spaceship();
        target.id = 'off-bearing-target';
        target.faction = Faction.Raiders;
        target.position = Vec2.make({ x: 0, y: TARGET_DISTANCE }); // bearing 90: beyond omni, outside the beam

        sim.withObjects(target);
        sim.spaceMgr.forceFlushEntities();

        sim.simulateUntilTime(0.3);
        expect(scanner.maxRadarRange, 'maxRadarRange alone would admit this target').to.be.greaterThan(TARGET_DISTANCE);

        queueScanJob(shipMgr, target.id);
        sim.simulateUntilTime(0.3);

        expect(
            shipMgr.state.signals.jobs.length,
            'a contact no sector covers must not be workable, however close it is',
        ).to.equal(0);
    });

    it('weapons target is NOT dropped when it sits beyond omni but inside a beam sector', () => {
        const sim = new SpaceSimulator(10);
        const scanner = new Spaceship();
        scanner.id = 'scanner';
        scanner.faction = Faction.Gravitas;
        scanner.position = Vec2.make({ x: 0, y: 0 });
        const shipMgr = sim.withShip(scanner, new ShipDie(0), ShipManagerPc);
        configureRadars(shipMgr);

        const target = new Asteroid();
        target.id = 'weapons-target';
        target.position = Vec2.make({ x: TARGET_DISTANCE, y: 0 });

        sim.withObjects(target);
        sim.spaceMgr.forceFlushEntities();

        // assign the weapons target (beyond omni 1000, well within the beam's reach)
        shipMgr.state.weaponsTarget.targetId = target.id;

        // validateWeaponsTargetId runs every tick and nulls a target the ship's field of view does
        // not hold; a target inside the beam sector is in view, so the lock must survive.
        sim.simulateUntilTime(0.3);

        expect(
            shipMgr.state.weaponsTarget.targetId,
            'weapons target inside a beam sector though beyond omni must be retained',
        ).to.equal(target.id);
    });
});
