import 'mocha';
import {
    limitPercision,
    MAX_SAFE_FLOAT,
    ShipManager,
    SpaceManager,
    Spaceship,
    timeToReachDistanceByAccelerationWithMaxSpeed,
    timeToReachVelocityByAcceleration,
} from '../src';
import { GraphPointInput, PlotlyGraphBuilder } from './ploty-graph-builder';

abstract class AbsTestMetrics {
    constructor(public iterationsPerSecond: number, public distance: number) {}
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
        return Math.max(1, limitPercision(2 * this.iterationDistance + this.percisionErrorsBoundery));
    }
    get logErrorMargin() {
        return Math.max(1, limitPercision(Math.log(this.iterationDistance) + this.percisionErrorsBoundery));
    }
}

const stabilizationFactor = 1.3;
export class MovementTestMetrics extends AbsTestMetrics {
    constructor(
        public iterationsPerSecond: number,
        public distance: number,
        public capacity: number,
        private maxSpeed: number = MAX_SAFE_FLOAT
    ) {
        super(iterationsPerSecond, distance);
    }
    get timeToReach() {
        return (
            Math.max(1, timeToReachDistanceByAccelerationWithMaxSpeed(this.distance, this.capacity, this.maxSpeed)) *
            stabilizationFactor
        );
    }
}
export class SpeedTestMetrics extends AbsTestMetrics {
    constructor(public iterationsPerSecond: number, public speedDiff: number, public capacity: number) {
        super(iterationsPerSecond, speedDiff);
    }
    get timeToReach() {
        return Math.max(1, timeToReachVelocityByAcceleration(this.speedDiff, this.capacity)) * stabilizationFactor;
    }
}

export class TimedTestMetrics extends AbsTestMetrics {
    constructor(iterationsPerSecond: number, public timeToReach: number, distance: number) {
        super(iterationsPerSecond, distance);
    }
}
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace NodeJS {
        interface Global {
            harness?: ShipTestHarness;
        }
    }
}
export class ShipTestHarness {
    public spaceMgr = new SpaceManager();
    public shipObj = new Spaceship();
    public shipMgr = new ShipManager(this.shipObj, this.spaceMgr);
    private graphBuilder: PlotlyGraphBuilder | null = null;

    constructor() {
        this.shipObj.id = '1';
        this.spaceMgr.insert(this.shipObj);
        global.harness = this;
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
    simulate(timeInSeconds: number, iterations: number, body?: (time: number, log?: GraphPointInput) => unknown) {
        const iterationTimeInSeconds = limitPercision(timeInSeconds / iterations);
        this.shipMgr.update(iterationTimeInSeconds);
        this.spaceMgr.update(iterationTimeInSeconds);
        this.graphBuilder?.newPoint(0);
        for (let i = 0; i < iterations; i++) {
            const p = this.graphBuilder?.newPoint(iterationTimeInSeconds);
            this.shipState.reserveSpeed = this.shipState.maxReserveSpeed;
            this.shipState.energy = this.shipState.maxEnergy;
            body && body(iterationTimeInSeconds, p);
            this.shipMgr.update(iterationTimeInSeconds);
            this.spaceMgr.update(iterationTimeInSeconds);
        }
        this.graphBuilder?.newPoint(iterationTimeInSeconds);
    }
    addToGraph(n: string, v: number) {
        this.graphBuilder?.newPoint(0).addtoLine(n, v);
    }
    annotateGraph(text: string) {
        this.graphBuilder?.newPoint(0).annotate(text);
    }
}
