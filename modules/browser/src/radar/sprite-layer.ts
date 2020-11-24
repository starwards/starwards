import { XY } from '@starwards/model';
import * as PIXI from 'pixi.js';
import { CameraView } from './camera-view';

export type SpriteStylePx = {
    fileName: string;
    tint: number;
    sizePx: number;
};
export type SpriteStyleMeters = {
    fileName: string;
    tint: number;
    radiusMeters: number;
};
function isSpriteStylePx(style: SpriteStylePx | SpriteStyleMeters): style is SpriteStylePx {
    return typeof (style as SpriteStylePx).sizePx === 'number';
}
export class SpriteLayer {
    public sprite: PIXI.Sprite;
    private resized = true;

    constructor(
        parent: CameraView,
        style: SpriteStylePx | SpriteStyleMeters,
        getLocation: () => XY | undefined,
        getRotation: () => number
    ) {
        const texture = PIXI.Loader.shared.resources[style.fileName].texture; // assumed to be pre-loaded
        this.sprite = new PIXI.Sprite(texture);
        this.sprite.anchor.set(0.5);
        if (isSpriteStylePx(style)) {
            this.sprite.height = style.sizePx;
            this.sprite.width = style.sizePx;
        } else {
            parent.events.on('screenChanged', () => {
                this.resized = true;
            });
            parent.ticker.add((_delta) => {
                if (this.resized) {
                    this.resized = false;
                    const size = parent.metersToPixles(style.radiusMeters);
                    this.sprite.height = size * 2;
                    this.sprite.width = size * 2;
                }
            });
        }
        this.sprite.tint = style.tint;

        parent.ticker.add((_delta) => {
            const location = getLocation();
            if (location) {
                this.sprite.visible = true;
                const locationScreen = parent.worldToScreen(location);
                this.sprite.position.x = locationScreen.x;
                this.sprite.position.y = locationScreen.y;
                this.sprite.rotation = getRotation();
            } else {
                this.sprite.visible = false;
            }
        });
    }
    get renderRoot(): PIXI.DisplayObject {
        return this.sprite;
    }
}
