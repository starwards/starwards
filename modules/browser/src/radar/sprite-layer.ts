import { DisplayObject, Sprite, Texture, UPDATE_PRIORITY } from 'pixi.js';

import { CameraView } from './camera-view';
import { XY } from '@starwards/core';

type SpriteStyle = {
    texture: Texture | undefined;
    tint: number;
};
export class SpriteLayer {
    public sprite: Sprite;

    constructor(
        parent: CameraView,
        style: SpriteStyle,
        getLocation: () => XY | undefined,
        getRotation: () => number,
        getRadius: () => number
    ) {
        this.sprite = new Sprite(style.texture);
        this.sprite.anchor.set(0.5);
        this.sprite.tint = style.tint;

        parent.ticker.add(
            (_delta) => {
                const location = getLocation();
                if (location) {
                    this.sprite.visible = true;
                    const locationScreen = parent.worldToScreen(location);
                    this.sprite.position.x = locationScreen.x;
                    this.sprite.position.y = locationScreen.y;
                    this.sprite.rotation = getRotation();
                    this.sprite.height = getRadius() * 2;
                    this.sprite.width = getRadius() * 2;
                } else {
                    this.sprite.visible = false;
                }
            },
            null,
            UPDATE_PRIORITY.LOW
        );
    }
    get renderRoot(): DisplayObject {
        return this.sprite;
    }
}
