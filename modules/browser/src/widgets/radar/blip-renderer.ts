import { SpaceObjects, Vec2 } from '@starwards/model';
import * as PIXI from 'pixi.js';

export const preloadList = ['images/RadarBlip.png', 'images/radar_fighter.png'];

type DrawBlip<T extends keyof SpaceObjects> = (
  spaceObject: SpaceObjects[T],
  root: PIXI.Container
) => Set<string>;

const drawFunctions: { [T in keyof SpaceObjects]: DrawBlip<T> } = {
  Spaceship(
    spaceObject: SpaceObjects['Spaceship'],
    root: PIXI.Container
  ): Set<string> {
    const radarBlipTexture =
      PIXI.Loader.shared.resources['images/radar_fighter.png'].texture;
    const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
    radarBlipSprite.pivot.x = radarBlipSprite.width / 2;
    radarBlipSprite.pivot.y = radarBlipSprite.height / 2;
    radarBlipSprite.tint = 0xff0000;
    radarBlipSprite.angle = spaceObject.angle % 360;
    root.addChild(radarBlipSprite);
    const text = new PIXI.Text(
`speed: ${Vec2.lengthOf(spaceObject.velocity).toFixed()}
turn speed: ${spaceObject.turnSpeed.toFixed()}`,
      new PIXI.TextStyle({
        fontFamily: 'Bebas',
        fontSize: 14,
        fill: 0xff0000,
        align: 'left'
      })
    );
    text.y = radarBlipSprite.height;
    text.x = -text.getLocalBounds(new PIXI.Rectangle()).width / 2;
    root.addChild(text);
    return new Set(['angle', 'turnSpeed', 'velocity' ]);
  },
  Asteroid(
    spaceObject: SpaceObjects['Asteroid'],
    root: PIXI.Container
  ): Set<string> {
    const radarBlipTexture =
      PIXI.Loader.shared.resources['images/RadarBlip.png'].texture;
    const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
    radarBlipSprite.scale = new PIXI.Point(0.5, 0.5);
    radarBlipSprite.x = -radarBlipSprite.width / 2;
    radarBlipSprite.y = -radarBlipSprite.height / 2;
    radarBlipSprite.tint = 0xffff0b;
    root.addChild(radarBlipSprite);
    const text = new PIXI.Text(
      `Asteroid\nradius: ${spaceObject.radius.toFixed()}`,
      new PIXI.TextStyle({
        fontFamily: 'Bebas',
        fontSize: 14,
        fill: 0xffff0b,
        align: 'left'
      })
    );
    text.y = radarBlipSprite.height;
    text.x = -text.getLocalBounds(new PIXI.Rectangle()).width / 2;
    root.addChild(text);
    return new Set(['radius']);
  }
};

/**
 * render a radar blip according to the space object
 * @param spaceObject subject to render
 * @param blip PIXI container to render into
 * @returns a set of property names of `spaceObject` that were used for the render
 */
export function blipRenderer<T extends keyof SpaceObjects>(
  spaceObject: SpaceObjects[T],
  blip: PIXI.Container
): Set<string> {
  return (drawFunctions[spaceObject.type] as DrawBlip<T>)(spaceObject, blip);
}
