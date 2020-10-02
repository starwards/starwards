import { expect } from 'chai';
import fc from 'fast-check';
import 'mocha';
import {
    limitPercision,
    moveToTarget,
    rotationFromTargetTurnSpeed,
    ShipManager,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
} from '../src';
import { floatIn, xy } from './properties';

class ShipTestHarness {
    public spaceMgr = new SpaceManager();
    public shipObj = new Spaceship();
    public shipMgr = new ShipManager(this.shipObj, this.spaceMgr);
    constructor() {
        this.shipObj.id = '1';
        this.spaceMgr.insert(this.shipObj);
    }
    get shipState() {
        return this.shipMgr.state;
    }
    simulate(timeInSeconds: number, iterations: number, body: (time: number) => unknown) {
        const iterationTimeInSeconds = timeInSeconds / iterations;
        this.shipMgr.update(iterationTimeInSeconds);
        this.spaceMgr.update(iterationTimeInSeconds);
        for (let i = 0; i < iterations; i++) {
            body(iterationTimeInSeconds);
            for (let i = 0; i < 5; i++) {
                this.shipMgr.update(iterationTimeInSeconds / 5);
                this.spaceMgr.update(iterationTimeInSeconds / 5);
            }
        }
    }
}
type LineData = {
    name: string;
    y: number[];
    x: number[];
};
class PlotlyGraphBuilder {
    public readonly lines: Record<string, LineData | undefined> = {};
    public readonly annotations = Array.of<[string, number]>();
    private lastAnnotation = '';
    private lastPoint = 0;
    constructor(...lineNames: string[]) {
        for (const name of lineNames) {
            this.lines[name] = { name, y: Array.of<number>(), x: Array.of<number>() };
        }
    }
    public build() {
        return {
            kind: { plotly: true },
            data: Object.values(this.lines),
            layout: {
                showlegend: true,
                legend: { orientation: 'h' },
                annotations: this.annotations.map(([text, x], i) => {
                    const y = (i % 2) * 2 - 1;
                    return { x, y, xref: 'x', yref: 'y', text };
                }),
            },
        };
    }
    newPoint(delta: number) {
        const x = this.lastPoint + delta;
        this.lastPoint = x;
        const addtoLine = (name: string, value: number) => {
            const lineData = this.lines[name];
            if (lineData) {
                lineData.y.push(value);
                lineData.x.push(x);
            }
        };
        const annotate = (text: string) => {
            if (this.lastAnnotation !== text) {
                this.lastAnnotation = text;
                this.annotations.push([text, x]);
            }
        };
        return {
            addtoLine,
            annotate,
        };
    }
}

describe('helm assist', () => {
    describe('rotationFromTargetTurnSpeed', () => {
        it('acheives target turnSpeed in a reasonable time', () => {
            const MIN_GRACE = 0.01;
            const MIN_TIME = 1;
            fc.assert(
                fc.property(floatIn(2000), fc.integer(10, 100), (turnSpeed: number, iterations: number) => {
                    const harness = new ShipTestHarness();
                    const turnSpeedDiff = Math.abs(turnSpeed);
                    const errorMargin = Math.max(MIN_GRACE, turnSpeedDiff / Math.sqrt(iterations));
                    const timeToReach = Math.max(MIN_TIME, turnSpeedDiff / harness.shipState.rotationCapacity);
                    harness.shipObj.turnSpeed = turnSpeed;
                    harness.simulate(timeToReach, iterations, (time: number) => {
                        const rotation = rotationFromTargetTurnSpeed(harness.shipState, 0, time);
                        harness.shipMgr.setRotation(rotation);
                    });
                    expect(limitPercision(harness.shipObj.turnSpeed)).to.be.closeTo(0, errorMargin);
                })
            );
        });
    });

    describe('moveToTarget', () => {
        it('(boost only) reach target in good time from 0 speed', () => {
            const MIN_TIME = 1;
            fc.assert(
                fc.property(floatIn(2000, 100), fc.integer(15, 20), (fromX: number, iterationsPerSecond: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.position.x = fromX;
                    const distance = Math.abs(fromX);
                    const timeToReach = Math.max(
                        MIN_TIME,
                        2 * Math.sqrt(distance / harness.shipState.movementCapacity) // from equasion of motion
                    );
                    const iterations = Math.floor(timeToReach * iterationsPerSecond);
                    const errorMargin = distance / Math.sqrt(iterations);
                    const g = new PlotlyGraphBuilder('boost', 'velocity', 'position');
                    const iteration = (time: number) => {
                        const p = g.newPoint(time);
                        const maneuvering = moveToTarget(time, harness.shipState, { x: 0, y: 0 }, p.annotate);
                        harness.shipMgr.setBoost(maneuvering.boost);
                        p.addtoLine('boost', maneuvering.boost);
                        p.addtoLine('position', harness.shipState.position.x);
                        p.addtoLine('velocity', harness.shipState.velocity.x);
                    };
                    harness.simulate(timeToReach, iterations, iteration);
                    expect(harness.shipObj.position.x, 'position').to.be.closeTo(0, errorMargin);
                    harness.simulate(timeToReach, iterations, iteration);
                    expect(harness.shipObj.position.x, 'position after stabling').to.be.closeTo(
                        0,
                        Math.log(errorMargin)
                    );
                })
            );
        });

        it.skip('acheives target location in a reasonable time from 0 speed', () => {
            const iterations = 10;
            fc.assert(
                fc.property(xy(2000), xy(2000), (from: XY, to: XY) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.position = Vec2.make(from);
                    const distance = XY.lengthOf(XY.difference(from, to));
                    const errorMargin = distance / Math.sqrt(iterations);
                    const timeToReach = Math.max(1, Math.abs(distance)) / harness.shipState.movementCapacity;

                    harness.simulate(timeToReach, iterations, (time: number) => {
                        const maneuvering = moveToTarget(time, harness.shipState, to);
                        // console.log(`maneuvering`, maneuvering);
                        harness.shipMgr.setBoost(maneuvering.boost);
                        harness.shipMgr.setStrafe(maneuvering.strafe);
                    });
                    // console.log(`result`, harness.shipObj.position.toJSON());
                    expect(XY.lengthOf(XY.difference(harness.shipObj.position, to))).to.be.lte(errorMargin);
                })
            );
        });
    });
});
