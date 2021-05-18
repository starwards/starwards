import { DrawFunctions, ObjectData, ObjectRendererFactory, SpaceObjectRenderer, renderText } from './blip-renderer';
import { Graphics, Loader, Rectangle, Sprite } from 'pixi.js';
import { SpaceObject, Spaceship } from '@starwards/model';

import { InteractiveLayer } from './interactive-layer';
import { white } from '../colors';

const textures = {
    fighter: 'images/tactical_radar/dragonfly.png',
    select: 'images/tactical_radar/selection.png',
};

Loader.shared.add(Object.values(textures));

function blipSprite(t: keyof typeof textures, size: number, color: number) {
    const texturePath = textures[t];
    const radarBlipTexture = Loader.shared.resources[texturePath].texture;
    const radarBlipSprite = new Sprite(radarBlipTexture);
    radarBlipSprite.tint = color;
    radarBlipSprite.height = size;
    radarBlipSprite.width = size;
    radarBlipSprite.anchor.set(0.5);
    return radarBlipSprite;
}

function circleRenderer(
    blipSize: () => number,
    getColor: (s: SpaceObject) => number
): ObjectRendererFactory<SpaceObject> {
    return class CircleRenderer implements SpaceObjectRenderer {
        private shellCircle = new Graphics();
        private selectionSprite = blipSprite('select', blipSize(), InteractiveLayer.selectionColor);
        constructor(private data: ObjectData<SpaceObject>) {
            const { stage } = this.data;
            stage.addChild(this.shellCircle);
            stage.addChild(this.selectionSprite);
            this.redraw();
        }
        redraw(): void {
            const { parent, spaceObject, isSelected } = this.data;
            const radius = Math.max(parent.metersToPixles(spaceObject.radius), 1);
            this.shellCircle.clear();
            this.shellCircle.beginFill(getColor(spaceObject));
            this.shellCircle.drawCircle(0, 0, radius);
            this.selectionSprite.visible = isSelected;
            this.selectionSprite.height = blipSize();
            this.selectionSprite.width = blipSize();
        }
    };
}

export type Argument = { blipSize: () => number; getColor: (s: SpaceObject) => number };
export function tacticalDrawFunctions({ blipSize, getColor }: Argument): DrawFunctions {
    class SpaceshipRenderer implements SpaceObjectRenderer {
        private selectionSprite = blipSprite('select', blipSize(), InteractiveLayer.selectionColor);
        private fighterSprite = blipSprite('fighter', blipSize(), white);
        private text = renderText(blipSize() / 2, [], white);
        private collisionOutline = new Graphics();

        constructor(private data: ObjectData<Spaceship>) {
            const { stage } = this.data;
            stage.addChild(this.fighterSprite);
            stage.addChild(this.text);
            stage.addChild(this.collisionOutline);
            stage.addChild(this.selectionSprite);
            this.redraw();
        }

        redraw(): void {
            const { parent, spaceObject, isSelected } = this.data;
            this.fighterSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
            this.fighterSprite.tint = getColor(spaceObject);
            this.fighterSprite.height = blipSize();
            this.fighterSprite.width = blipSize();
            this.text.text = [`ID: ${spaceObject.id}`, `health: ${spaceObject.health.toFixed(0)}`].join('\n');
            this.text.x = -this.text.getLocalBounds(new Rectangle()).width / 2;
            this.collisionOutline.clear();
            this.collisionOutline.lineStyle(1, 0x4ce73c, 0.5);
            this.collisionOutline.drawCircle(0, 0, parent.metersToPixles(spaceObject.radius));
            this.selectionSprite.visible = isSelected;
            this.selectionSprite.height = blipSize();
            this.selectionSprite.width = blipSize();
        }
    }

    return {
        Spaceship: SpaceshipRenderer,
        Asteroid: circleRenderer(blipSize, getColor),
        CannonShell: circleRenderer(blipSize, getColor),
        Explosion: circleRenderer(blipSize, getColor),
    };
}
