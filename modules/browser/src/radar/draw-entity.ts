import { SpaceObjects } from '@starwards/model';
import * as PIXI from 'pixi.js';

export const preloadList = ['images/RadarBlip.png', 'images/radar_fighter.png'];

export type DrawFunction<T extends keyof SpaceObjects> = (
  entity: SpaceObjects[T],
  root: PIXI.Container
) => string[];

const drawFunctions: { [T in keyof SpaceObjects]: DrawFunction<T> } = {
  Spaceship(entity: SpaceObjects['Spaceship'], root: PIXI.Container): string[] {
    const radarBlipTexture =
      PIXI.Loader.shared.resources['images/radar_fighter.png'].texture;
    const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
    radarBlipSprite.x = -radarBlipSprite.width / 2;
    radarBlipSprite.y = -radarBlipSprite.height / 2;
    radarBlipSprite.tint = 0xff0000;
    radarBlipSprite.angle = entity.angle % 360;
    root.addChild(radarBlipSprite);
    return ['angle'];
  },
  Asteroid(entity: SpaceObjects['Asteroid'], root: PIXI.Container): string[] {
    const radarBlipTexture =
      PIXI.Loader.shared.resources['images/RadarBlip.png'].texture;
    const radarBlipSprite = new PIXI.Sprite(radarBlipTexture);
    radarBlipSprite.scale = new PIXI.Point(0.5, 0.5);
    radarBlipSprite.x = -radarBlipSprite.width / 2;
    radarBlipSprite.y = -radarBlipSprite.height / 2;
    radarBlipSprite.tint = 0xffff0b;
    root.addChild(radarBlipSprite);
    const text = new PIXI.Text(
      `Asteroid\nradius: ${entity.radius.toFixed()}`,
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
    return ['radius'];
  }
};

export function draw<T extends keyof SpaceObjects>(type: T): DrawFunction<T> {
  return drawFunctions[type] as DrawFunction<T>;
}
