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
    get sqrtErrorMargin() {
        return Math.max(
            1,
            limitPercision(Math.sqrt(this.iterationDistance) + this.percisionErrorsBoundery),
            limitPercision(Math.sqrt(this.distance * 0.05)),
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

    simulate(timeInSeconds: number, iterations: number, body?: (time: number, log?: GraphPointInput) => unknown) {
        const i = new Iterator([...makeIterationsData(timeInSeconds, iterations)]);
        this.shipMgr.update(i.first());
        this.spaceMgr.update(i.first());
        this.graphBuilder?.newPoint(0);
        for (const id of i.allAfter(i.first())) {
            const p = this.graphBuilder?.newPoint(id.deltaSeconds);
            this.shipState.maneuvering.afterBurnerFuel = this.shipState.maneuvering.design.maxAfterBurnerFuel;
            this.shipState.reactor.energy = this.shipState.reactor.design.maxEnergy;
            body && body(id.deltaSeconds, p);
            this.shipMgr.update(id);
            this.spaceMgr.update(id);
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
