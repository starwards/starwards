import { SpaceObjects, Vec2, SpaceObject, Spaceship, Asteroid, XY } from '@starwards/model';
import * as PIXI from 'pixi.js';

export const preloadList = ['images/RadarBlip.png', 'images/radar_fighter.png', 'images/redicule.png'];

PIXI.Loader.shared.add(preloadList);

type DrawBlip<T extends keyof SpaceObjects> = (spaceObject: SpaceObjects[T], root: PIXI.Container) => Set<string>;

const drawFunctions: { [T in keyof SpaceObjects]: DrawBlip<T> } = {
    Spaceship(spaceObject: Spaceship, root: PIXI.Container): Set<string> {
        const radarBlipTexture = PIXI.Loader.shared.resources['images/radar_fighter.png'].texture;
        const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
        radarBlipSprite.pivot.x = radarBlipSprite.width / 2;
        radarBlipSprite.pivot.y = radarBlipSprite.height / 2;
        radarBlipSprite.tint = 0xff0000;
        radarBlipSprite.angle = spaceObject.angle % 360;
        root.addChild(radarBlipSprite);
        const text = renderText(
            radarBlipSprite.height,
            [
                `ID: ${spaceObject.id}`,
                `[${spaceObject.position.x.toFixed(0)}:${spaceObject.position.y.toFixed(0)}]`,
                `speed: ${Vec2.lengthOf(spaceObject.velocity).toFixed()}`,
                `turn speed: ${spaceObject.turnSpeed.toFixed()}`,
            ],
            0xff0000
        );
        root.addChild(text);
        return new Set(['angle', 'turnSpeed', 'velocity', 'position']);
    },
    Asteroid(spaceObject: Asteroid, root: PIXI.Container): Set<string> {
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
        return new Set(['radius']);
    },
};

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
 * @returns a set of property names of `spaceObject` that were used for the render
 */
export function blipRenderer(spaceObject: SpaceObject, blip: PIXI.Container, selected: boolean): Set<string> {
    const propsToTrack = (drawFunctions[spaceObject.type] as DrawBlip<typeof spaceObject.type>)(spaceObject, blip);
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
    radarBlipSprite.tint = 0x26dafd;
    root.addChild(radarBlipSprite);
}
