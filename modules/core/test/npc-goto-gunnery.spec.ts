import {
    ChaingunDesign,
    Faction,
    IdleStrategy,
    Order,
    ShipDesign,
    ShipDirectionConfig,
    ShipManagerNpc,
    ShipManagerPc,
    ShipModel,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    solveShellIntercept,
    isTargetInKillZone,
    makeShipState,
    shipConfigurations,
    toDegreesDelta,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';
import { degree, float } from './properties';

import { expect } from 'chai';
import fc from 'fast-check';

/**
 * Reproduces the manual test that failed on this branch: a new game with two ships of different
 * factions (one PC, one NPC), the NPC set to `IdleStrategy.ROAM` and given a *go-to* (MOVE) order
 * along a path that hands it excellent shots at the PC ship. It never opens fire.
 *
 * The behaviour under test is `AutomationManager.runGunnery`'s documented contract -- "gunnery is
 * on by default for every NPC, independent of `state.order`; orders govern movement only". Under
 * `Order.MOVE`, `firingAllowed` is true regardless of `idleStrategy`, so on paper the NPC engages
 * hostiles of opportunity as it flies its route.
 */

/** Mobile hulls that actually carry a chain gun, as an NPC in a fresh game would. */
const GUNNED_MODELS = ['dragonfly-MK1', 'demo-ship'] as const satisfies readonly ShipModel[];

/**
 * The same hull, with its chain gun given a full-traverse turret mount instead of the bolted one
 * (`bearingLimit: 0, turnSpeed: 0`) both stock configs ship. Used by the control tests to separate
 * the two gates a shot has to pass: whether any mount can be brought onto the target at all
 * (`canBearOn`), and whether the shot then converges on it (`isTargetInKillZone`). A full-traverse
 * mount clears the first on its own, so a control that still fails is failing the second.
 */
function fullTraverseVariant(model: (typeof GUNNED_MODELS)[number]): ShipDesign {
    const config = shipConfigurations[model];
    const chainGuns = config.chainGuns.map(([direction, design]): [ShipDirectionConfig, ChaingunDesign] => [
        direction,
        { ...design, bearingLimit: 180, turnSpeed: 30 },
    ]);
    return { ...config, chainGuns };
}

type Scenario = {
    spaceMgr: SpaceManager;
    npcObj: Spaceship;
    npcMgr: ShipManagerNpc;
    pcObj: Spaceship;
    pcMgr: ShipManagerPc;
};

/**
 * One NPC at the origin and one stationary PC ship of a hostile faction, positioned to sit right
 * beside the NPC's route -- the "very good opportunity to shoot" of the manual test.
 *
 * @param heading direction of the NPC's route, degrees
 * @param pathLength how far along that heading the go-to destination sits
 * @param interceptFraction where along the route the PC ship sits, as a fraction of `pathLength`
 * @param lateralOffset how far off the route line the PC ship sits (signed)
 */
function createScenario(
    model: (typeof GUNNED_MODELS)[number],
    heading: number,
    pathLength: number,
    interceptFraction: number,
    lateralOffset: number,
    npcConfig: ShipDesign = shipConfigurations[model],
): Scenario & { destination: XY } {
    const spaceMgr = new SpaceManager();
    const die = new MockDie();
    die.expectedRoll = 1;

    // .init() (not just setting .id/.position) is what sets the SpaceObject's physical radius from
    // the ship config, which real hit detection depends on.
    const npcObj = new Spaceship().init('npc', Vec2.make(XY.zero), model, Faction.Raiders);
    const npcState = makeShipState(npcObj.id, npcConfig);
    npcState.isPlayerShip = false;
    npcState.idleStrategy = IdleStrategy.ROAM;
    const npcMgr = new ShipManagerNpc(npcObj, npcState, spaceMgr, die);

    const destination = XY.byLengthAndDirection(pathLength, heading);
    const pcPosition = XY.add(
        XY.byLengthAndDirection(pathLength * interceptFraction, heading),
        XY.byLengthAndDirection(lateralOffset, heading + 90),
    );
    const pcObj = new Spaceship().init('pc', Vec2.make(pcPosition), 'demo-ship', Faction.Gravitas);
    const pcState = makeShipState(pcObj.id, shipConfigurations['demo-ship']);
    pcState.isPlayerShip = true;
    const pcMgr = new ShipManagerPc(pcObj, pcState, spaceMgr, die);

    spaceMgr.insert(npcObj);
    spaceMgr.insert(pcObj);
    spaceMgr.forceFlushEntities();

    return { spaceMgr, npcObj, npcMgr, pcObj, pcMgr, destination };
}

/**
 * Issues the go-to through the real GM pipeline (`botOrderCommands` -> `SpaceManager.update` ->
 * `objectOrder` -> `AutomationManager.getAndApplyOrder`) rather than writing `state.order`
 * directly, so the test exercises the same path the GM's "go to" button does. The order lands on a
 * following tick; the simulation below is long enough to absorb that lag.
 */
function orderMoveTo(spaceMgr: SpaceManager, shipId: string, position: XY) {
    spaceMgr.state.botOrderCommands.push({ ids: [shipId], order: { type: 'move', position } });
}

type EngagementReport = {
    /** Ticks where the PC sat inside some mount's `[minShellRange, maxShellRange]` envelope. */
    opportunityTicks: number;
    /** Ticks where any of the NPC's mounts reported firing. */
    firingTicks: number;
    /** Ticks where some mount could actually be brought to bear (`canBearOn`'s own predicate). */
    bearableTicks: number;
    /**
     * Ticks where some mount's shot would actually have landed (`isTargetInKillZone`). Separates
     * "no mount could point at it" from "a mount was pointing at it but the shot never converged".
     */
    killZoneTicks: number;
    totalTicks: number;
    /** Closest the NPC ever came to the PC. */
    minDistance: number;
    /** Smallest hull-relative aiming shortfall seen while the PC was inside the range envelope. */
    minBearingShortfall: number;
    /** The NPC's own speed at its closest approach — the quantity shell aim must compensate for. */
    speedAtClosestApproach: number;
    shotsFired: number;
};

/**
 * Runs the engagement and reports what the NPC saw and did. `minBearingShortfall` mirrors
 * `AutomationManager.canBearOn`'s own arithmetic — the traverse each mount needs to lay its firing
 * line on that mount's intercept aim point, measured off its rest bearing (fitted plus damage skew)
 * against its `bearingLimit` — so a failure names *why* no mount could bear rather than only
 * reporting silence. Scoring it off `fittedBearing` against the raw line of sight instead reads 0 on
 * a pass where the mount never came close to a shot, which is how the original #2145 failure
 * misdirected.
 */
function runEngagement(scenario: Scenario, simSeconds: number, iterationsPerSecond: number): EngagementReport {
    const { spaceMgr, npcObj, npcMgr, pcMgr } = scenario;
    const guns = npcMgr.state.chainGuns;
    const minRange = Math.min(...guns.map((g) => g.design.minShellRange));
    const maxRange = Math.max(...guns.map((g) => g.design.maxShellRange));

    const report: EngagementReport = {
        opportunityTicks: 0,
        firingTicks: 0,
        bearableTicks: 0,
        killZoneTicks: 0,
        totalTicks: 0,
        minDistance: Infinity,
        minBearingShortfall: Infinity,
        speedAtClosestApproach: 0,
        shotsFired: 0,
    };

    for (const id of makeIterationsData(simSeconds, simSeconds * iterationsPerSecond)) {
        npcMgr.update(id);
        pcMgr.update(id);
        spaceMgr.update(id);
        report.totalTicks++;

        const shipToTarget = XY.difference(scenario.pcObj.position, npcObj.position);
        const distance = XY.lengthOf(shipToTarget);
        if (distance < report.minDistance) {
            report.minDistance = distance;
            report.speedAtClosestApproach = XY.lengthOf(npcObj.velocity);
        }
        if (distance >= minRange && distance <= maxRange) {
            report.opportunityTicks++;
            let anyBearable = false;
            for (const gun of guns) {
                const { aimPoint } = solveShellIntercept(npcMgr.state, gun, scenario.pcObj);
                const hullBearing = toDegreesDelta(
                    XY.angleOf(XY.difference(aimPoint, npcObj.position)) - npcMgr.state.angle,
                );
                const shortfall = Math.max(0, Math.abs(gun.bearingCommandFor(hullBearing)) - gun.bearingLimit);
                report.minBearingShortfall = Math.min(report.minBearingShortfall, shortfall);
                anyBearable ||= shortfall === 0;
            }
            if (anyBearable) {
                report.bearableTicks++;
            }
            if (guns.some((gun) => isTargetInKillZone(npcMgr.state, gun, scenario.pcObj))) {
                report.killZoneTicks++;
            }
        }
        if (guns.some((gun) => gun.isFiring)) {
            report.firingTicks++;
        }
        report.shotsFired = [...spaceMgr.state.getAll('Projectile')].length;
    }
    return report;
}

/** Ticks of in-envelope exposure below which a run presented no real shot and proves nothing. */
const MIN_OPPORTUNITY_TICKS = 20;

const SIM_SECONDS = 150;

function describeReport(report: EngagementReport) {
    return (
        `opportunityTicks=${report.opportunityTicks}/${report.totalTicks}, ` +
        `bearableTicks=${report.bearableTicks}, killZoneTicks=${report.killZoneTicks}, ` +
        `firingTicks=${report.firingTicks}, shotsFired=${report.shotsFired}, ` +
        `minDistance=${Math.round(report.minDistance)}m, ` +
        `minBearingShortfall=${report.minBearingShortfall.toFixed(1)}deg, ` +
        `speedAtClosestApproach=${Math.round(report.speedAtClosestApproach)}m/s`
    );
}

describe('NPC on a go-to order engaging hostiles of opportunity', function () {
    jest.setTimeout(180 * 1000);

    it('fires on a hostile PC ship it flies past while executing a MOVE order', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...GUNNED_MODELS),
                degree(),
                float(12_000, 25_000),
                float(0.3, 0.7),
                float(1_200, 3_000),
                fc.constantFrom(-1, 1),
                fc.integer({ min: 15, max: 20 }),
                (model, heading, pathLength, interceptFraction, offsetMagnitude, offsetSign, iterationsPerSecond) => {
                    const scenario = createScenario(
                        model,
                        heading,
                        pathLength,
                        interceptFraction,
                        offsetMagnitude * offsetSign,
                    );
                    orderMoveTo(scenario.spaceMgr, scenario.npcObj.id, scenario.destination);

                    const report = runEngagement(scenario, SIM_SECONDS, iterationsPerSecond);

                    // Only runs that genuinely presented a shot can say anything: geometry where
                    // the PC never entered the gun envelope is not evidence of a bug.
                    fc.pre(report.opportunityTicks > MIN_OPPORTUNITY_TICKS);

                    expect(report.firingTicks, `${model}: ${describeReport(report)}`).to.be.greaterThan(0);
                },
            ),
            { numRuns: 12 },
        );
    });

    /**
     * Fixed-geometry controls that turn the property failure above into a diagnosis. All three use
     * the same hull, the same hostile, and the same head-on-then-past geometry; only the ordered
     * state and the mount's traverse differ.
     */
    describe('controls isolating the cause', () => {
        const model = 'dragonfly-MK1';
        const heading = 0;
        const pathLength = 20_000;
        const interceptFraction = 0.5;
        const lateralOffset = 1_500;
        const iterationsPerSecond = 20;

        /**
         * Baseline. The NPC is idle (so stationary, and its hull keeps its initial angle) and the
         * PC is parked 2,500m *dead ahead* — inside the 500-4,500m envelope and squarely within
         * even a bolted mount's zero-width bearing envelope. Establishes that faction filtering,
         * range, ammo, energy and the fire plumbing all work, and that a ROAM NPC with no order
         * does shoot. Everything that follows differs from this by exactly one thing.
         */
        it('idle, stationary, target dead ahead: does open fire', () => {
            const scenario = createScenario(model, heading, pathLength, 0.125, 0);
            const report = runEngagement(scenario, SIM_SECONDS, iterationsPerSecond);

            expect(scenario.npcMgr.state.order).to.equal(Order.NONE);
            expect(report.opportunityTicks, describeReport(report)).to.be.greaterThan(MIN_OPPORTUNITY_TICKS);
            expect(report.firingTicks, describeReport(report)).to.be.greaterThan(0);
        });

        /**
         * Baseline plus one change: the target sits off the bow. A bolted mount (`bearingLimit: 0`)
         * cannot be brought to bear on it and no order is rotating the hull, so the NPC is silent.
         * This is the *bearing* half of the failure, visible even without any movement order.
         */
        it('idle, stationary, target off the bow: still opens fire (bolted mount cannot bear)', () => {
            const scenario = createScenario(model, heading, pathLength, 0.1, lateralOffset);
            const report = runEngagement(scenario, SIM_SECONDS, iterationsPerSecond);

            expect(scenario.npcMgr.state.order).to.equal(Order.NONE);
            expect(report.opportunityTicks, describeReport(report)).to.be.greaterThan(MIN_OPPORTUNITY_TICKS);
            expect(report.firingTicks, describeReport(report)).to.be.greaterThan(0);
        });

        /**
         * The previous case with the bearing constraint lifted: still stationary, still off the
         * bow, but now the mount can traverse onto the target. Expected to pass — which is what
         * makes the moving full-traverse case below attributable to speed alone rather than to
         * aiming geometry.
         */
        it('idle, stationary, target off the bow, full-traverse mount: does open fire', () => {
            const scenario = createScenario(model, heading, pathLength, 0.1, lateralOffset, fullTraverseVariant(model));
            const report = runEngagement(scenario, SIM_SECONDS, iterationsPerSecond);

            expect(scenario.npcMgr.state.order).to.equal(Order.NONE);
            expect(report.opportunityTicks, describeReport(report)).to.be.greaterThan(MIN_OPPORTUNITY_TICKS);
            expect(report.firingTicks, describeReport(report)).to.be.greaterThan(0);
        });

        /**
         * The stock bolted mount (`bearingLimit: 0, turnSpeed: 0`), which can only be aimed by
         * aiming the hull. `goto()` flies the route, so the shot exists only if the transit heading
         * concession gives way far enough to put the mount on the target and holds it there.
         */
        it('the same NPC under a MOVE order opens fire', () => {
            const scenario = createScenario(model, heading, pathLength, interceptFraction, lateralOffset);
            orderMoveTo(scenario.spaceMgr, scenario.npcObj.id, scenario.destination);
            const report = runEngagement(scenario, SIM_SECONDS, iterationsPerSecond);

            expect(report.opportunityTicks, describeReport(report)).to.be.greaterThan(MIN_OPPORTUNITY_TICKS);
            expect(report.firingTicks, describeReport(report)).to.be.greaterThan(0);
        });

        /**
         * The same MOVE order with the bearing constraint lifted, isolating the second gate. The
         * mount bears for the whole pass, so anything that fails here is the shot itself failing to
         * converge: an NPC transiting at speed launches shells carrying its own velocity, and
         * `solveShellIntercept` has to solve aim point and time of flight together for the round to
         * arrive where the target will be.
         */
        it('under a MOVE order with a full-traverse mount: opens fire', () => {
            const scenario = createScenario(
                model,
                heading,
                pathLength,
                interceptFraction,
                lateralOffset,
                fullTraverseVariant(model),
            );
            orderMoveTo(scenario.spaceMgr, scenario.npcObj.id, scenario.destination);
            const report = runEngagement(scenario, SIM_SECONDS, iterationsPerSecond);

            expect(report.opportunityTicks, describeReport(report)).to.be.greaterThan(MIN_OPPORTUNITY_TICKS);
            expect(report.firingTicks, describeReport(report)).to.be.greaterThan(0);
        });
    });
});
