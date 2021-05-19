import { Asteroid, SpaceObject, Spaceship } from '@starwards/model';
import { DrawFunctions, ObjectData, SpaceObjectRenderer, renderText } from './blip-renderer';
import { Graphics, Loader, Rectangle, Sprite } from 'pixi.js';
import { selectionColor, white } from '../../colors';

const textures = {
    fighter: 'images/dradis/fighter.png',
    asteroid: 'images/dradis/asteroid.png',
    circleBase: 'images/dradis/circle-base.png',
    circleBevel: 'images/dradis/circle-bevel.png',
    direction: 'images/dradis/direction.png',
    select: 'images/dradis/select.png',
};

Loader.shared.add(Object.values(textures));

export type Argument = { blipSize: () => number; getColor: (s: SpaceObject) => number };
export function dradisDrawFunctions({ blipSize, getColor }: Argument): DrawFunctions {
    function blipSprite(t: keyof typeof textures, color: number) {
        const texturePath = textures[t];
        const radarBlipTexture = Loader.shared.resources[texturePath].texture;
        const radarBlipSprite = new Sprite(radarBlipTexture);
        radarBlipSprite.height = blipSize();
        radarBlipSprite.tint = color;
        radarBlipSprite.width = blipSize();
        radarBlipSprite.anchor.set(0.5);
        return radarBlipSprite;
    }

    class SpaceshipRenderer implements SpaceObjectRenderer {
        private selectionSprite = blipSprite('select', selectionColor);
        private directionSprite = blipSprite('direction', white);
        private circleBaseSprite = blipSprite('circleBase', white);
        private circleBevelSprite = blipSprite('circleBevel', white);
        private fighterSprite = blipSprite('fighter', white);
        private text = renderText(blipSize() / 2, [], white);
        private collisionOutline = new Graphics();

        constructor(private data: ObjectData<Spaceship>) {
            const { stage } = this.data;
            stage.addChild(this.directionSprite);
            stage.addChild(this.circleBaseSprite);
            stage.addChild(this.circleBevelSprite);
            stage.addChild(this.fighterSprite);
            stage.addChild(this.text);
            stage.addChild(this.collisionOutline);
            stage.addChild(this.selectionSprite);
            this.redraw();
        }

        redraw(): void {
            const { parent, spaceObject, isSelected } = this.data;
            this.directionSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
            this.text.text = [`ID: ${spaceObject.id}`, `health: ${spaceObject.health.toFixed(0)}`].join('\n');
            this.text.x = -this.text.getLocalBounds(new Rectangle()).width / 2;
            this.collisionOutline.clear();
            this.collisionOutline.lineStyle(1, 0x4ce73c, 0.5);
            this.collisionOutline.drawCircle(0, 0, parent.metersToPixles(spaceObject.radius));
            this.selectionSprite.visible = isSelected;
            this.circleBevelSprite.tint = getColor(spaceObject);
            this.fighterSprite.tint = getColor(spaceObject);
        }
    }
    class AsteroidRenderer implements SpaceObjectRenderer {
        private selectionSprite = blipSprite('select', selectionColor);
        private circleBaseSprite = blipSprite('circleBase', white);
        private circleBevelSprite = blipSprite('circleBevel', white);
        private asteroidSprite = blipSprite('asteroid', white);
        private collisionOutline = new Graphics();
        constructor(private data: ObjectData<Asteroid>) {
            const { stage } = this.data;
            stage.addChild(this.circleBaseSprite);
            stage.addChild(this.circleBevelSprite);
            stage.addChild(this.asteroidSprite);
            stage.addChild(this.collisionOutline);
            stage.addChild(this.selectionSprite);
            this.redraw();
        }
        redraw(): void {
            const { parent, spaceObject, isSelected } = this.data;
            this.collisionOutline.clear();
            this.collisionOutline.lineStyle(1, 0x4ce73c, 0.5);
            this.collisionOutline.drawCircle(0, 0, parent.metersToPixles(spaceObject.radius));
            this.selectionSprite.visible = isSelected;
            this.circleBevelSprite.tint = getColor(spaceObject);
            this.asteroidSprite.tint = getColor(spaceObject);
        }
    }

    return {
        Spaceship: SpaceshipRenderer,
        Asteroid: AsteroidRenderer,
    };
}
