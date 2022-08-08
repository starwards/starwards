import '@pixi/graphics-extras';

import { Container, DisplayObject, Graphics, UPDATE_PRIORITY } from 'pixi.js';

import { CameraView } from './camera-view';
import { XY } from '@starwards/core';

type Style = {
    width: number;
    color: number;
    alpha: number;
};
export class MovementAnchorLayer {
    private stage = new Container();

    private readonly anchors = new Graphics();
    private shouldRender = true;

    constructor(private parent: CameraView, private style: Style, private spacing: number, private range: number) {
        if (!this.anchors.drawStar) {
            throw new Error('looks like @pixi/graphics-extras is not loaded correctly');
        }
        this.parent.events.on('screenChanged', () => {
            this.shouldRender = true;
        });
        this.stage.addChild(this.anchors);
        parent.ticker.add((_delta) => this.draw(), null, UPDATE_PRIORITY.LOW);
    }

    get renderRoot(): DisplayObject {
        return this.stage;
    }

    private *anchorPositions() {
        const center = this.parent.screenToWorld({
            x: this.parent.renderer.width / 2,
            y: this.parent.renderer.height / 2,
        });
        const max = XY.add(center, { x: this.range, y: this.range });
        const min = XY.add(center, { x: -this.range, y: -this.range });
        const gridlineHorizTop = min.y - (min.y % this.spacing);
        const gridlineVertLeft = min.x - (min.x % this.spacing);
        for (let worldY = gridlineHorizTop; worldY <= max.y; worldY += this.spacing) {
            for (let worldX = gridlineVertLeft; worldX <= max.x; worldX += this.spacing) {
                const candidate = { x: worldX, y: worldY };
                if (XY.lengthOf(XY.difference(candidate, center)) <= this.range) {
                    yield this.parent.worldToScreen(candidate);
                }
            }
        }
    }

    private draw() {
        if (this.shouldRender) {
            this.anchors.clear();
            for (const anchorPosition of this.anchorPositions()) {
                this.anchors.lineStyle(this.style.width, this.style.color, this.style.alpha);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.anchors.drawStar!(anchorPosition.x, anchorPosition.y, 3, 1, 0);
            }
            this.shouldRender = false;
        }
    }
}
