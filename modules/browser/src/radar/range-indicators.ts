import { CameraView } from './camera-view';
import { TextsPool } from './texts-pool';
import * as PIXI from 'pixi.js';

const TEXT_MARGIN = 5;
export class RangeIndicators {
    private stage = new PIXI.Container();
    private readonly rangeIndicators = new PIXI.Graphics();
    private readonly rangeNames = new TextsPool(this.stage);

    constructor(private parent: CameraView, private stepSize: number) {
        this.parent.events.on('screenChanged', () => this.drawRangeIndicators());
        this.stage.addChild(this.rangeIndicators);
        this.drawRangeIndicators();
    }

    changeStepSize(delta: number) {
        this.stepSize = Math.max(1, this.stepSize * (1.0 + delta / 1000.0));
    }

    get renderRoot(): PIXI.DisplayObject {
        return this.stage;
    }

    private drawRangeIndicators() {
        this.rangeIndicators.clear();
        this.rangeIndicators.lineStyle(2, 0xffffff, 0.1);
        const textsIterator = this.rangeNames[Symbol.iterator]();
        const maxCircleSize = this.parent.pixelsToMeters(this.parent.radius);
        // draw circles
        for (let circleSize = this.stepSize; circleSize < maxCircleSize; circleSize += this.stepSize) {
            // this.rangeIndicators.beginFill(0x00000000);
            const radius = circleSize * this.parent.camera.zoom;
            this.rangeIndicators.drawCircle(this.parent.renderer.width / 2, this.parent.renderer.height / 2, radius);
            const text = textsIterator.next().value;
            text.text = circleSize + 'M';
            text.style.fill = 0xffffff;
            text.alpha = 0.1;
            text.x = this.parent.renderer.width / 2 - text.width / 2;
            text.y = this.parent.renderer.height / 2 - text.height - radius - TEXT_MARGIN;
        }
        textsIterator.return();
    }
}
