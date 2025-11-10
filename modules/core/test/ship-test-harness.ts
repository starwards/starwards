import { GraphPointInput, PlotlyGraphBuilder } from './ploty-graph-builder';
import {
    Iterator,
    MAX_SAFE_FLOAT,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    limitPercision,
    makeShipState,
    shipConfigurations,
    timeToReachDistanceByAccelerationWithMaxSpeed,
    timeToReachVelocityByAcceleration,
} from '../src';

import { IterationData } from '../src/updateable';
import { ShipDie } from '../src/ship/ship-die';

export class MockDie {
    private _expectedRoll = 0;
    public getRoll(_: string, __?: number, ___?: number): number {
        return this._expectedRoll;
    }

    public getSuccess(_: string, successProbability: number): boolean {
        return this._expectedRoll < successProbability;
    }

    public getRollInRange(_: string, min: number, max: number): number {
        if (this._expectedRoll >= min && this._expectedRoll < max) {
            return this._expectedRoll;
        }
        return min;
    }

    set expectedRoll(roll: number) {
        this._expectedRoll = roll;
    }
}
abstract class AbsTestMetrics {
    constructor(
        public iterationsPerSecond: number,
        public distance: number,
    ) {}
    abstract readonly timeToReach: number;
    get iterations() {
        return Math.floor(this.timeToReach * this.iterationsPerSecond);
    }
    get iterationDistance() {
        return this.distance / this.iterations;
    }
    get percisionErrorsBoundery() {
        return this.iterations * Math.abs(limitPercision(this.iterationDistance) - this.iterationDistance);
    }
    get errorMargin() {
        return Math.max(
            1,
            this.distance * 0.05,
            limitPercision(2 * this.iterationDistance + this.percisionErrorsBoundery),
        );
    }
    get stabilizationErrorMargin() {
        // For stabilization, account for control loop oscillations
        // The helm assist uses 2-iteration prediction, so error can be 2x the iteration distance
        const controlLoopError = 2 * this.iterationDistance;
        return Math.max(
            1,
            limitPercision(controlLoopError + this.percisionErrorsBoundery),
            limitPercision(this.distance * 0.01),
        );
    }
}

const stabilizationFactor = 2;
export class MovementTestMetrics extends AbsTestMetrics {
    constructor(
        public iterationsPerSecond: number,
        public distance: number,
        public capacity: number,
        private maxSpeed: number = MAX_SAFE_FLOAT,
    ) {
        super(iterationsPerSecond, distance);
    }
    get timeToReach() {
        const time = timeToReachDistanceByAccelerationWithMaxSpeed(this.distance, this.capacity, this.maxSpeed);
        return Math.max(1, time) * stabilizationFactor;
    }
}
export class SpeedTestMetrics extends AbsTestMetrics {
    constructor(
        public iterationsPerSecond: number,
        public speedDiff: number,
        public capacity: number,
    ) {
        super(iterationsPerSecond, speedDiff);
    }
    get timeToReach() {
        return Math.max(1, timeToReachVelocityByAcceleration(this.speedDiff, this.capacity)) * stabilizationFactor;
    }
}

export class TimedTestMetrics extends AbsTestMetrics {
    constructor(
        iterationsPerSecond: number,
        public timeToReach: number,
        distance: number,
    ) {
        super(iterationsPerSecond, distance);
    }
}

declare let global: typeof globalThis & {
    harness?: ShipTestHarness;
};

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

export function* makeIterationsData(
    timeInSeconds: number,
    iterations: number,
    breakCondition: (id: IterationData) => boolean = () => false,
): Generator<IterationData> {
    const iterationTimeInSeconds = limitPercision(timeInSeconds / iterations);
    for (let i = 0; i < iterations; i++) {
        const id = {
            deltaSeconds: iterationTimeInSeconds,
            deltaSecondsAvg: iterationTimeInSeconds,
            totalSeconds: (i + 1) * iterationTimeInSeconds,
        };
        yield id;
        if (breakCondition(id)) return;
    }
}

export interface CombatScenarioConfig {
    shipCount: number;
    teams?: number[];
    positions?: Array<{ x: number; y: number }>;
    rotations?: number[];
}

export interface StateSnapshot {
    time: number;
    ships: Array<{
        id: string;
        x: number;
        y: number;
        rotation: number;
        velocity: { x: number; y: number };
        armor: number;
    }>;
    projectiles: number;
    explosions: number;
}

export class ShipTestHarness {
    public spaceMgr = new SpaceManager();
    public shipObj = new Spaceship();
    public shipMgr = new ShipManagerPc(
        this.shipObj,
        makeShipState(this.shipObj.id, dragonflyConfig),
        this.spaceMgr,
        new ShipDie(3),
    );
    private graphBuilder: PlotlyGraphBuilder | null = null;
    private stateHistory: StateSnapshot[] = [];
    private historyEnabled = false;
    private physicsInvariants: Array<{ predicate: () => boolean; message: string }> = [];

    constructor() {
        this.shipObj.id = '1';
        this.spaceMgr.insert(this.shipObj);
        global.harness = this;
        this.shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        this.shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
    }

    get shipState() {
        return this.shipMgr.state;
    }

    graph() {
        if (!this.graphBuilder) {
            throw new Error('graph not initialized');
        }
        return this.graphBuilder.build();
    }

    initGraph(metrics: Record<string, () => number>) {
        this.graphBuilder = new PlotlyGraphBuilder(metrics);
    }

    /**
     * Create a combat scenario with multiple ships
     */
    createCombatScenario(config: CombatScenarioConfig): Spaceship[] {
        const ships: Spaceship[] = [];

        for (let i = 0; i < config.shipCount; i++) {
            const ship = new Spaceship();
            ship.id = `ship-${i + 2}`; // Start from 2 since main ship is 1
            ship.faction = config.teams?.[i] ?? i % 2;

            // Position ships
            if (config.positions?.[i]) {
                ship.position.x = config.positions[i].x;
                ship.position.y = config.positions[i].y;
            } else {
                // Default circular positioning
                const angle = (i / config.shipCount) * Math.PI * 2;
                const radius = 500;
                ship.position.x = Math.cos(angle) * radius;
                ship.position.y = Math.sin(angle) * radius;
            }

            // Set rotation
            if (config.rotations?.[i] !== undefined) {
                ship.angle = config.rotations[i];
            } else {
                // Point towards center
                ship.angle = (Math.atan2(-ship.position.y, -ship.position.x) * 180) / Math.PI;
            }

            this.spaceMgr.insert(ship);
            ships.push(ship);
        }

        return ships;
    }

    /**
     * Add a physics invariant that will be checked during simulation
     */
    assertPhysicsInvariant(predicate: () => boolean, message: string): void {
        this.physicsInvariants.push({ predicate, message });
    }

    /**
     * Enable state history recording
     */
    enableStateHistory(): void {
        this.historyEnabled = true;
        this.stateHistory = [];
    }

    /**
     * Disable state history recording
     */
    disableStateHistory(): void {
        this.historyEnabled = false;
    }

    /**
     * Get state at a specific time (or closest available)
     */
    getStateAt(time: number): StateSnapshot | null {
        if (this.stateHistory.length === 0) return null;

        // Find closest snapshot
        let closest = this.stateHistory[0];
        let minDiff = Math.abs(closest.time - time);

        for (const snapshot of this.stateHistory) {
            const diff = Math.abs(snapshot.time - time);
            if (diff < minDiff) {
                minDiff = diff;
                closest = snapshot;
            }
        }

        return closest;
    }

    /**
     * Get all recorded state history
     */
    getStateHistory(): StateSnapshot[] {
        return [...this.stateHistory];
    }

    /**
     * Clear state history
     */
    clearStateHistory(): void {
        this.stateHistory = [];
    }

    /**
     * Record current state snapshot
     */
    private recordStateSnapshot(time: number): void {
        if (!this.historyEnabled) return;

        const ships = Array.from(this.spaceMgr.state.getAll('Spaceship')).map((ship) => {
            return {
                id: ship.id,
                x: ship.position.x,
                y: ship.position.y,
                rotation: ship.angle,
                velocity: { x: ship.velocity.x, y: ship.velocity.y },
                armor: this.shipMgr.state.armor.numberOfHealthyPlates,
            };
        });

        this.stateHistory.push({
            time,
            ships,
            projectiles: Array.from(this.spaceMgr.state.getAll('Projectile')).length,
            explosions: Array.from(this.spaceMgr.state.getAll('Explosion')).length,
        });
    }

    /**
     * Check all registered physics invariants
     */
    private checkPhysicsInvariants(): void {
        for (const { predicate, message } of this.physicsInvariants) {
            if (!predicate()) {
                throw new Error(`Physics invariant violated: ${message}`);
            }
        }
    }

    simulate(timeInSeconds: number, iterations: number, body?: (time: number, log?: GraphPointInput) => unknown) {
        const i = new Iterator([...makeIterationsData(timeInSeconds, iterations)]);
        this.shipMgr.update(i.first());
        this.spaceMgr.update(i.first());
        this.graphBuilder?.newPoint(0);
        this.recordStateSnapshot(0);

        let totalTime = 0;

        for (const id of i.allAfter(i.first())) {
            const p = this.graphBuilder?.newPoint(id.deltaSeconds);
            this.shipState.maneuvering.afterBurnerFuel = this.shipState.maneuvering.design.maxAfterBurnerFuel;
            this.shipState.reactor.energy = this.shipState.reactor.design.maxEnergy;
            body && body(id.deltaSeconds, p);
            this.shipMgr.update(id);
            this.spaceMgr.update(id);

            totalTime += id.deltaSeconds;
            this.recordStateSnapshot(totalTime);
            this.checkPhysicsInvariants();
        }
        this.graphBuilder?.newPoint(i.last().deltaSeconds);
    }

    addToGraph(n: string, v: number) {
        this.graphBuilder?.newPoint(0).addtoLine(n, v);
    }

    annotateGraph(text: string) {
        this.graphBuilder?.newPoint(0).annotate(text);
    }
}
