import { Asteroid, CannonShell, Explosion, SpaceObject, SpaceObjects, Spaceship, Vec2 } from '@starwards/model';
import { Container, Graphics, Loader, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';

import { CameraView } from './camera-view';
import { InteractiveLayer } from './interactive-layer';

export const preloadList = [
    'images/RadarBlip.png',
    'images/radar_fighter.png',
    'images/redicule.png',
    'images/RadarArrow.png',
];

Loader.shared.add(preloadList);

type DrawBlip<T extends keyof SpaceObjects> = (
    spaceObject: SpaceObjects[T],
    root: Container,
    parent: CameraView
) => void;

const drawFunctions: { [T in keyof SpaceObjects]: DrawBlip<T> } = {
    Spaceship(spaceObject: Spaceship, root: Container, parent: CameraView) {
        const radarBlipTexture = Loader.shared.resources['images/radar_fighter.png'].texture;
        const radarBlipSprite = new Sprite(radarBlipTexture);
        radarBlipSprite.pivot.x = radarBlipSprite.width / 2;
        radarBlipSprite.pivot.y = radarBlipSprite.height / 2;
        radarBlipSprite.tint = 0xff0000;
        radarBlipSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
        root.addChild(radarBlipSprite);
        const text = renderText(
            radarBlipSprite.height / 2,
            [
                `ID: ${spaceObject.id}`,
                `[${spaceObject.position.x.toFixed(0)}:${spaceObject.position.y.toFixed(0)}]`,
                `speed: ${Vec2.lengthOf(spaceObject.velocity).toFixed()}`,
                `turn speed: ${spaceObject.turnSpeed.toFixed()}`,
                `health: ${spaceObject.health.toFixed(0)}`,
            ],
            0xff0000
        );
        root.addChild(text);
        const body = renderShape(parent, spaceObject.radius);
        root.addChild(body);
    },
    Asteroid(spaceObject: Asteroid, root: Container, parent: CameraView) {
        const radarBlipTexture = Loader.shared.resources['images/RadarBlip.png'].texture;
        const radarBlipSprite = new Sprite(radarBlipTexture);
        radarBlipSprite.scale.x = 0.5;
        radarBlipSprite.scale.y = 0.5;
        radarBlipSprite.x = -radarBlipSprite.width / 2;
        radarBlipSprite.y = -radarBlipSprite.height / 2;
        radarBlipSprite.tint = 0xffff0b;
        root.addChild(radarBlipSprite);
        const text = renderText(
            radarBlipSprite.height,
            [`Asteroid\nradius: ${spaceObject.radius.toFixed()}`],
            0xffff0b
        );
        root.addChild(text);
        const body = renderShape(parent, spaceObject.radius);
        root.addChild(body);
    },
    CannonShell(spaceObject: CannonShell, root: Container, parent: CameraView) {
        const radarBlipTexture = Loader.shared.resources['images/RadarArrow.png'].texture;
        const radarBlipSprite = new Sprite(radarBlipTexture);
        radarBlipSprite.scale.x = 0.1;
        radarBlipSprite.scale.y = 0.1;
        radarBlipSprite.pivot.x = radarBlipSprite.width / 2;
        radarBlipSprite.pivot.y = radarBlipSprite.height / 2;
        radarBlipSprite.tint = 0xffff0b;
        radarBlipSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
        root.addChild(radarBlipSprite);
        const body = renderShape(parent, spaceObject.radius);
        root.addChild(body);
    },
    Explosion(spaceObject: Explosion, root: Container, parent: CameraView) {
        const radarBlipTexture = Loader.shared.resources['images/RadarBlip.png'].texture;
        const radarBlipSprite = new Sprite(radarBlipTexture);
        radarBlipSprite.scale.x = 0.2;
        radarBlipSprite.scale.y = 0.2;
        radarBlipSprite.x = -radarBlipSprite.width / 2;
        radarBlipSprite.y = -radarBlipSprite.height / 2;
        radarBlipSprite.tint = 0xe74c3c;
        radarBlipSprite.alpha = 0.3;
        root.addChild(radarBlipSprite);
        const body = renderShape(parent, spaceObject.radius);
        root.addChild(body);
    },
};

function renderShape(parent: CameraView, radius: number) {
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
    const radarBlipTexture = Loader.shared.resources['images/redicule.png'].data as Texture;
    const radarBlipSprite = new Sprite(radarBlipTexture);
    radarBlipSprite.pivot.x = radarBlipSprite.width / 2;
    radarBlipSprite.pivot.y = radarBlipSprite.height / 2;
    radarBlipSprite.tint = InteractiveLayer.selectionColor;
    root.addChild(radarBlipSprite);
}
