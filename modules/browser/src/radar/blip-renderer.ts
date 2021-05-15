import { Asteroid, CannonShell, Explosion, SpaceObject, SpaceObjects, Spaceship, Vec2 } from '@starwards/model';
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

type DrawBlip<T extends keyof SpaceObjects> = (
    spaceObject: SpaceObjects[T],
    root: Container,
    parent: CameraView
) => void;

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

const drawFunctions: { [T in keyof SpaceObjects]: DrawBlip<T> } = {
    Spaceship(spaceObject: Spaceship, root: Container, parent: CameraView) {
        root.addChild(blipSprite('circleBase', white));
        root.addChild(blipSprite('circleBevel', white));
        const directionSprite = blipSprite('direction', white);
        directionSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
        root.addChild(directionSprite);
        const fighterSprite = blipSprite('fighter', white);
        root.addChild(fighterSprite);
        const text = renderText(
            halfBlipSize,
            [`ID: ${spaceObject.id}`, `health: ${spaceObject.health.toFixed(0)}`],
            white
        );
        root.addChild(text);
        const body = renderCollisionOutline(parent, spaceObject.radius);
        root.addChild(body);
    },
    Asteroid(spaceObject: Asteroid, root: Container, parent: CameraView) {
        root.addChild(blipSprite('circleBase', white));
        root.addChild(blipSprite('circleBevel', white));
        root.addChild(blipSprite('asteroid', white));
        const body = renderCollisionOutline(parent, spaceObject.radius);
        root.addChild(body);
    },
    CannonShell(spaceObject: CannonShell, root: Container, parent: CameraView) {
        const radius = parent.metersToPixles(spaceObject.radius);
        if (radius >= minShapePixles) {
            const shellCircle = new Graphics();
            shellCircle.beginFill(0xffff0b);
            shellCircle.drawCircle(0, 0, radius);
            root.addChild(shellCircle);
        }
    },
    Explosion(spaceObject: Explosion, root: Container, parent: CameraView) {
        const radius = parent.metersToPixles(spaceObject.radius);
        if (radius >= minShapePixles) {
            const explosionCircle = new Graphics();
            explosionCircle.beginFill(0xe74c3c);
            explosionCircle.drawCircle(0, 0, radius);
            root.addChild(explosionCircle);
        }
    },
};

function renderCollisionOutline(parent: CameraView, radius: number) {
    const body = new Graphics();
    body.lineStyle(1, 0x4ce73c, 0.5);
    body.drawCircle(0, 0, parent.metersToPixles(radius));
    return body;
}

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
export function blipRenderer(spaceObject: SpaceObject, blip: Container, selected: boolean, parent: CameraView) {
    (drawFunctions[spaceObject.type] as DrawBlip<typeof spaceObject.type>)(spaceObject, blip, parent);
    if (selected) {
        selectionRenderer(blip);
    }
}

export function selectionRenderer(root: Container) {
    root.addChild(blipSprite('select', InteractiveLayer.selectionColor));
}
