import { Asteroid, CannonShell, Explosion, SpaceObject, SpaceObjects, Spaceship } from '@starwards/model';
import { Container, Graphics, Loader, Rectangle, Sprite, Text, TextStyle } from 'pixi.js';

import { CameraView } from './camera-view';
import { InteractiveLayer } from './interactive-layer';

const textures = {
    fighter: 'images/radar/fighter.png',
    asteroid: 'images/radar/asteroid.png',
    circleBase: 'images/radar/circle-base.png',
    circleBevel: 'images/radar/circle-bevel.png',
    direction: 'images/radar/direction.png',
    select: 'images/radar/select.png',
};

Loader.shared.add(Object.values(textures));

export interface ObjectData<T extends SpaceObject> {
    parent: CameraView;
    spaceObject: T;
    stage: Container;
    isSelected: boolean;
}

interface ObjectRendererFactory<T extends SpaceObject> {
    new (data: ObjectData<T>): SpaceObjectRenderer;
}
export interface SpaceObjectRenderer {
    redraw(): void;
}

const blipSize = 128;
const halfBlipSize = blipSize / 2;
const minShapePixles = 0.5;
const white = 0xffffff;
function blipSprite(t: keyof typeof textures, color: number) {
    const texturePath = textures[t];
    const radarBlipTexture = Loader.shared.resources[texturePath].texture;
    const radarBlipSprite = new Sprite(radarBlipTexture);
    radarBlipSprite.height = blipSize;
    radarBlipSprite.tint = color;
    radarBlipSprite.width = blipSize;
    radarBlipSprite.anchor.set(0.5);
    return radarBlipSprite;
}

class SpaceshipRenderer implements SpaceObjectRenderer {
    private selectionSprite = blipSprite('select', InteractiveLayer.selectionColor);
    private directionSprite = blipSprite('direction', white);
    private circleBaseSprite = blipSprite('circleBase', white);
    private circleBevelSprite = blipSprite('circleBevel', white);
    private fighterSprite = blipSprite('fighter', white);
    private text = renderText(halfBlipSize, [], white);
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
    }
}
class AsteroidRenderer implements SpaceObjectRenderer {
    private selectionSprite = blipSprite('select', InteractiveLayer.selectionColor);
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
    }
}
class CannonShellRenderer implements SpaceObjectRenderer {
    constructor(private data: ObjectData<CannonShell>) {
        this.redraw();
    }
    redraw(): void {
        const { stage, parent, spaceObject, isSelected } = this.data;
        stage.removeChildren();
        const radius = parent.metersToPixles(spaceObject.radius);
        if (radius >= minShapePixles) {
            const shellCircle = new Graphics();
            shellCircle.beginFill(0xffff0b);
            shellCircle.drawCircle(0, 0, radius);
            stage.addChild(shellCircle);
        }
        if (isSelected) {
            selectionRenderer(stage);
        }
    }
}
class ExplosionRenderer implements SpaceObjectRenderer {
    constructor(private data: ObjectData<Explosion>) {
        this.redraw();
    }
    redraw(): void {
        const { stage, parent, spaceObject, isSelected } = this.data;
        stage.removeChildren();
        const radius = parent.metersToPixles(spaceObject.radius);
        if (radius >= minShapePixles) {
            const explosionCircle = new Graphics();
            explosionCircle.beginFill(0xe74c3c);
            explosionCircle.drawCircle(0, 0, radius);
            stage.addChild(explosionCircle);
        }
        if (isSelected) {
            selectionRenderer(stage);
        }
    }
}

const drawFunctions: { [T in keyof SpaceObjects]: ObjectRendererFactory<SpaceObjects[T]> } = {
    Spaceship: SpaceshipRenderer,
    Asteroid: AsteroidRenderer,
    CannonShell: CannonShellRenderer,
    Explosion: ExplosionRenderer,
};

function renderText(y: number, value: string[], color: number) {
    const result = new Text(
        value.join('\n'),
        new TextStyle({
            fontFamily: 'Bebas',
            fontSize: 14,
            fill: color,
            align: 'left',
        })
    );
    result.y = y;
    result.x = -result.getLocalBounds(new Rectangle()).width / 2;
    return result;
}
/**
 * render a radar blip according to the space object
 * @param spaceObject subject to render
 * @param blip PIXI container to render into
 * @param selected indicates if the object is selected
 * @param parentAngle indicates the relative angle of the camera
 * @returns a set of property names of `spaceObject` that were used for the render
 */
export function blipRenderer<T extends SpaceObject>(data: ObjectData<T>) {
    const renderer = new (drawFunctions[data.spaceObject.type] as ObjectRendererFactory<T>)(data);
    return renderer;
}

export function selectionRenderer(stage: Container) {
    stage.addChild(blipSprite('select', InteractiveLayer.selectionColor));
}
