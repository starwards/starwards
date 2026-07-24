import { Asteroid, Faction, ScanLevel, ShipDie, ShipManagerPc, Spaceship, Vec2 } from '../src';

import { SpaceSimulator } from './simulator';
import { expect } from 'chai';

/**
 * I3 — range gates honor the unioned radar vision (INTEGRATION, RED suite).
 *
 * Intended final API (not implemented yet — these tests are the RED):
 *   - ShipState.radars: ArraySchema<Radar>. radars[0] is the 360° omni radar,
 *     radars[1] is the steerable directional scan-beam radar.
 *   - Radar.arc (deg), Radar.direction (ship-relative bearing, deg), Radar.range getter,
 *     Radar.design.{area,minArc,maxArc,defaultArc,range}.
 *   - Each tick the ship manager mirrors the radar union onto
 *     Spaceship.radarSectors ({ direction: world-bearing deg, arc: deg, range: m }),
 *     and Spaceship.radarRange becomes a getter === MAX sector range (back-compat).
 *   - Range gates that used to hard-compare against the scalar omni radarRange must
 *     honor the union: a target inside a beam sector though beyond the omni radius is
 *     IN range / scannable / not-dropped.
 *
 * Scenario shared by all three gates:
 *   scanner at origin, omni range small (1000 m). radars[1] beam aimed down world
 *   bearing 0 with arc 60° and a design area big enough to reach ~16.9 km. A target
 *   sits at (3000, 0): OUTSIDE the omni radius but INSIDE the beam sector.
 */

const OMNI_RANGE = 1000;
const TARGET_DISTANCE = 3000; // beyond omni, inside the beam sector
const BEAM_ARC = 60;
// area chosen so beam range = sqrt(area / (arc * PI/180)) ≈ 16.9 km, comfortably > TARGET_DISTANCE
const BEAM_DESIGN = { area: 3e8, minArc: 5, maxArc: 90, defaultArc: BEAM_ARC, range: 0 };

// Aim radars[0] (omni) short and radars[1] (beam) down world bearing 0 covering the target.
// (Guessed accessors: radars[0].design.range for the omni radius, radars[1].design.assign / .arc / .direction
//  for the beam. Mirrors the sibling red-suite usage in radar-collection.spec.ts / radar-range.spec.ts.)
function configureRadars(shipMgr: ShipManagerPc): void {
    const omni = shipMgr.state.radars[0];
    omni.design.range = OMNI_RANGE;

    const beam = shipMgr.state.radars[1];
    beam.design.assign(BEAM_DESIGN);
    beam.arc = BEAM_ARC;
    beam.direction = 0; // ship angle is 0, so ship-relative 0 == world bearing 0 (toward the target)
}

describe('radar range gates honor the beam (I3)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('canScan honors the beam: target beyond omni but inside the beam sector is scannable', () => {
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
        expect(sim.spaceMgr.canScan(scanner.id, inBeam.id), 'in-beam target should be scannable').to.be.true;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(
            sim.spaceMgr.canScan(scanner.id, outOfBeam.id),
            'target beyond omni and outside the beam bearing must NOT be scannable',
        ).to.be.false;
    });

    it('signals isTargetInRange honors the beam: a target beyond omni but within the sector union can be tracked', () => {
        // isTargetInRange is private; assert its observable consequence — a same-faction target
        // (scanLevel BASIC) beyond the omni radius but within the beam sector range can be added
        // as a tracked target (track activation gates on isTargetInRange && scanLevel >= BASIC).
        const sim = new SpaceSimulator(10);
        const scanner = new Spaceship();
        scanner.id = 'scanner';
        scanner.faction = Faction.Gravitas;
        scanner.position = Vec2.make({ x: 0, y: 0 });
        const shipMgr = sim.withShip(scanner, new ShipDie(0), ShipManagerPc);
        configureRadars(shipMgr);

        const target = new Spaceship();
        target.id = 'friendly-target';
        target.faction = Faction.Gravitas; // same faction => scanLevel BASIC without scanning
        target.position = Vec2.make({ x: TARGET_DISTANCE, y: 0 });

        sim.withObjects(target);
        sim.spaceMgr.forceFlushEntities();

        // let sectors populate first
        sim.simulateUntilTime(0.3);
        expect(sim.spaceMgr.getScanLevel(target.id, scanner.faction)).to.be.at.least(ScanLevel.BASIC);

        // request a track, then tick to let SignalsJobManager process it
        shipMgr.state.signals.activateTrackTargetId = target.id;
        sim.simulateUntilTime(0.3);

        expect(
            [...shipMgr.state.signals.trackedTargets],
            'target beyond omni but inside the beam sector should be trackable (isTargetInRange honors the union)',
        ).to.include(target.id);
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

        // assign the weapons target (beyond omni 1000, within beam range ~16.9 km)
        shipMgr.state.weaponsTarget.targetId = target.id;

        // validateWeaponsTargetId runs every tick and would null a target beyond spaceObject.radarRange;
        // with radarRange === MAX sector range, the in-sector target must survive.
        sim.simulateUntilTime(0.3);

        expect(
            shipMgr.state.weaponsTarget.targetId,
            'weapons target inside a beam sector though beyond omni must be retained',
        ).to.equal(target.id);
    });
});
