import { Container, Graphics, UPDATE_PRIORITY } from 'pixi.js';

import { CameraView } from './camera-view';
import { XY } from '@starwards/core';

// Line style for PixiJS v8
type Linestyle = { width: number; color: number; alpha?: number };

export class LineLayer {
    private readonly graphics = new Graphics();
    constructor(parent: CameraView, getPoints: () => [XY | undefined, XY | undefined], style: Linestyle) {
        parent.ticker.add(
            (_delta) => {
                this.graphics.clear();
                const [from, to] = getPoints();
                if (from && to) {
                    const fromScreen = parent.worldToScreen(from);
                    const toScreen = parent.worldToScreen(to);
                    this.graphics.moveTo(fromScreen.x, fromScreen.y).lineTo(toScreen.x, toScreen.y);
                    this.graphics.stroke(style);
                }
            },
            null,
            UPDATE_PRIORITY.LOW,
        );
    }
    get renderRoot(): Container {
        return this.graphics;
    }
}
