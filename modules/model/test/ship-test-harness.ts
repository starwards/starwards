import 'mocha';
import { ShipManager, SpaceManager, Spaceship } from '../src';
import { GraphPointInput, PlotlyGraphBuilder } from './ploty-graph-builder';

export class MovementTestMetrics {
    constructor(public iterationsPerSecond: number, public distance: number, public capacity: number) {}
    get timeToReach() {
        // from equasion of motion
        return Math.max(1, 2 * Math.sqrt(this.distance / this.capacity));
    }
    get iterations() {
        return Math.floor(this.timeToReach * this.iterationsPerSecond);
    }
    get errorMargin() {
        return Math.max(1, this.distance / this.iterations);
    }
    get logErrorMargin() {
        return Math.max(1, Math.log(this.distance / this.iterations));
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
    initGraph(metrics: Record<string, () => number>, lineNames: string[]) {
        this.graphBuilder = new PlotlyGraphBuilder(metrics, lineNames);
    }
    simulate(timeInSeconds: number, iterations: number, body: (time: number, log?: GraphPointInput) => unknown) {
        const iterationTimeInSeconds = timeInSeconds / iterations;
        this.shipMgr.update(iterationTimeInSeconds);
        this.spaceMgr.update(iterationTimeInSeconds);
        for (let i = 0; i < iterations; i++) {
            const p = this.graphBuilder?.newPoint(iterationTimeInSeconds);
            body(iterationTimeInSeconds, p);
            for (let i = 0; i < 5; i++) {
                this.shipMgr.update(iterationTimeInSeconds / 5);
                this.spaceMgr.update(iterationTimeInSeconds / 5);
            }
        }
    }
    annotateGraph(text: string) {
        this.graphBuilder?.newPoint(0).annotate(text);
    }
}
