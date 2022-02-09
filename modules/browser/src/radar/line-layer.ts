import { DisplayObject, Graphics } from 'pixi.js';

import { CameraView } from './camera-view';
import { XY } from '@starwards/model';

// extract line style argument from lineStyle method
export type Linestyle = Parameters<Graphics['lineStyle']>[0];

export class LineLayer {
    private readonly graphics = new Graphics();
    constructor(parent: CameraView, getPoints: () => [XY | undefined, XY | undefined], style: Linestyle) {
        parent.ticker.add((_delta) => {
            this.graphics.clear();
            const [from, to] = getPoints();
            if (from && to) {
                const fromScreen = parent.worldToScreen(from);
                const toScreen = parent.worldToScreen(to);
                this.graphics.lineStyle(style);
                this.graphics.moveTo(fromScreen.x, fromScreen.y).lineTo(toScreen.x, toScreen.y);
            }
        });
    }
    get renderRoot(): DisplayObject {
        return this.graphics;
    }
}
