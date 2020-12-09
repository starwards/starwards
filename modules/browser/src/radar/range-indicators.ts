import * as PIXI from 'pixi.js';

import { CameraView } from './camera-view';
import { TextsPool } from './texts-pool';

const TEXT_MARGIN = 5;
export class RangeIndicators {
    private stage = new PIXI.Container();
    private readonly rangeIndicators = new PIXI.Graphics();
    private readonly rangeNames = new TextsPool(this.stage);
    private sizeFactor = 1;
    private shouldRender = true;

    constructor(private parent: CameraView, private stepSize: number) {
        this.parent.events.on('screenChanged', () => {
            this.shouldRender = true;
        });
        parent.ticker.add((_delta) => {
            if (this.shouldRender) {
                this.drawRangeIndicators();
            }
        });
        this.stage.addChild(this.rangeIndicators);
    }

    setSizeFactor(value: number) {
        this.sizeFactor = value;
    }

    changeStepSize(delta: number) {
        this.stepSize = Math.max(1, this.stepSize * (1.0 + delta / 1000.0));
    }

    get renderRoot(): PIXI.DisplayObject {
        return this.stage;
    }

    private drawRangeIndicators() {
        this.shouldRender = false;
        this.rangeIndicators.clear();
        this.rangeIndicators.lineStyle(2, 0xffffff, 0.1);
        const textsIterator = this.rangeNames[Symbol.iterator]();
        const maxCircleSize = this.parent.pixelsToMeters(this.parent.radius * this.sizeFactor);
        // draw circles
        for (let circleSize = this.stepSize; circleSize <= maxCircleSize; circleSize += this.stepSize) {
            // this.rangeIndicators.beginFill(0x00000000);
            const radius = this.parent.metersToPixles(circleSize);
            this.rangeIndicators.drawCircle(this.parent.renderer.width / 2, this.parent.renderer.height / 2, radius);
            const text = textsIterator.next().value;
            text.text = circleSize.toString() + 'M';
            (text.style as PIXI.TextStyle).fill = 0xffffff;
            text.alpha = 0.1;
            text.x = this.parent.renderer.width / 2 - text.width / 2;
            text.y = this.parent.renderer.height / 2 - text.height - radius - TEXT_MARGIN;
        }
        textsIterator.return();
    }
}
