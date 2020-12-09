import * as PIXI from 'pixi.js';

import { Asteroid, CannonShell, Explosion, SpaceObject, SpaceObjects, Spaceship, Vec2 } from '@starwards/model';

import { CameraView } from './camera-view';
import { InteractiveLayer } from './interactive-layer';

export const preloadList = [
    'images/RadarBlip.png',
    'images/radar_fighter.png',
    'images/redicule.png',
    'images/RadarArrow.png',
];

PIXI.Loader.shared.add(preloadList);

type DrawBlip<T extends keyof SpaceObjects> = (
    spaceObject: SpaceObjects[T],
    root: PIXI.Container,
    parent: CameraView
) => Set<string>;

const drawFunctions: { [T in keyof SpaceObjects]: DrawBlip<T> } = {
    Spaceship(spaceObject: Spaceship, root: PIXI.Container, parent: CameraView): Set<string> {
        const radarBlipTexture = PIXI.Loader.shared.resources['images/radar_fighter.png'].texture;
        const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
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

        return new Set([
            'screen',
            'radius',
            'parentAngle',
            'angle',
            'turnSpeed',
            'velocity',
            'position',
            'health',
            'selected',
        ]);
    },
    Asteroid(spaceObject: Asteroid, root: PIXI.Container, parent: CameraView): Set<string> {
        const radarBlipTexture = PIXI.Loader.shared.resources['images/RadarBlip.png'].texture;
        const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
        radarBlipSprite.scale = new PIXI.Point(0.5, 0.5);
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
        return new Set(['screen', 'radius', 'selected']);
    },
    CannonShell(spaceObject: CannonShell, root: PIXI.Container, parent: CameraView): Set<string> {
        const radarBlipTexture = PIXI.Loader.shared.resources['images/RadarArrow.png'].texture;
        const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
        radarBlipSprite.scale = new PIXI.Point(0.1, 0.1);
        radarBlipSprite.pivot.x = radarBlipSprite.width / 2;
        radarBlipSprite.pivot.y = radarBlipSprite.height / 2;
        radarBlipSprite.tint = 0xffff0b;
        radarBlipSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
        root.addChild(radarBlipSprite);
        const body = renderShape(parent, spaceObject.radius);
        root.addChild(body);
        return new Set(['screen', 'radius', 'parentAngle', 'angle', 'selected']);
    },
    Explosion(spaceObject: Explosion, root: PIXI.Container, parent: CameraView): Set<string> {
        const radarBlipTexture = PIXI.Loader.shared.resources['images/RadarBlip.png'].texture;
        const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
        radarBlipSprite.scale = new PIXI.Point(0.2, 0.2);
        radarBlipSprite.x = -radarBlipSprite.width / 2;
        radarBlipSprite.y = -radarBlipSprite.height / 2;
        radarBlipSprite.tint = 0xe74c3c;
        radarBlipSprite.alpha = 0.3;
        root.addChild(radarBlipSprite);
        const body = renderShape(parent, spaceObject.radius);
        root.addChild(body);
        return new Set(['screen', 'radius', 'selected']);
    },
};

function renderShape(parent: CameraView, radius: number) {
    const body = new PIXI.Graphics();
    body.lineStyle(1, 0x4ce73c, 0.5);
    body.drawCircle(0, 0, parent.metersToPixles(radius));
    return body;
}

function renderText(y: number, value: string[], color: number) {
    const result = new PIXI.Text(
        value.join('\n'),
        new PIXI.TextStyle({
            fontFamily: 'Bebas',
            fontSize: 14,
            fill: color,
            align: 'left',
        })
    );
    result.y = y;
    result.x = -result.getLocalBounds(new PIXI.Rectangle()).width / 2;
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
export function blipRenderer(
    spaceObject: SpaceObject,
    blip: PIXI.Container,
    selected: boolean,
    parent: CameraView
): Set<string> {
    const propsToTrack = (drawFunctions[spaceObject.type] as DrawBlip<typeof spaceObject.type>)(
        spaceObject,
        blip,
        parent
    );
    if (selected) {
        selectionRenderer(blip);
    }
    return propsToTrack;
}

export function selectionRenderer(root: PIXI.Container) {
    const radarBlipTexture = PIXI.Loader.shared.resources['images/redicule.png'].texture;
    const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
    radarBlipSprite.pivot.x = radarBlipSprite.width / 2;
    radarBlipSprite.pivot.y = radarBlipSprite.height / 2;
    radarBlipSprite.tint = InteractiveLayer.selectionColor;
    root.addChild(radarBlipSprite);
}
