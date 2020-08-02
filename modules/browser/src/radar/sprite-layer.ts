import { XY } from '@starwards/model';
import * as PIXI from 'pixi.js';
import { CameraView } from './camera-view';

export type SpriteStyle = {
    fileName: string;
    tint: number;
    size: number;
};
export class SpriteLayer {
    public sprite: PIXI.Sprite;

    constructor(parent: CameraView, style: SpriteStyle, getLocation: () => XY | undefined) {
        const texture = PIXI.Loader.shared.resources[style.fileName].texture; // assumed to be pre-loaded
        this.sprite = new PIXI.Sprite(texture);
        this.sprite.anchor.set(0.5);
        this.sprite.height = style.size;
        this.sprite.width = style.size;
        this.sprite.tint = style.tint;

        parent.ticker.add((_delta) => {
            const location = getLocation();
            if (location) {
                this.sprite.visible = true;
                const locationScreen = parent.worldToScreen(location);
                this.sprite.position.x = locationScreen.x;
                this.sprite.position.y = locationScreen.y;
            } else {
                this.sprite.visible = false;
            }
        });
    }
    get renderRoot(): PIXI.DisplayObject {
        return this.sprite;
    }
}
