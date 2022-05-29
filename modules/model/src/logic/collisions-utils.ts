import { Circle, Polygon, Response, Types } from 'detect-collisions';

import { XY } from './xy';

export type SWBody = Circle;
export interface SWResponse extends Response {
    a: SWBody;
    b: SWBody;
}

export class Ray extends Polygon {
    readonly type: Types.Line = Types.Line;

    points!: [SAT.Vector, SAT.Vector];
    constructor(position: XY, delta: XY) {
        super(position, [XY.zero, delta]);

        if (delta.x === 0 && delta.y === 0) {
            // eslint-disable-next-line no-console
            console.error('created ray of 0 length');
        }
    }

    get globalPoints() {
        return [this.start, this.end] as const;
    }

    get start() {
        return XY.clone(this);
    }

    get end() {
        return XY.add(this, this.calcPoints[1]);
    }

    setDelta(delta: XY) {
        this.points[1].x = delta.x;
        this.points[1].y = delta.y;
        this.setPoints(this.points);
    }
}
