import { SpaceObject } from '@starwards/model';
import * as PIXI from 'pixi.js';

const propsToTrack = new Set(['velocity']);

/**
 * render a velocioty vector according to the space object
 * @param spaceObject subject to render
 * @param blip PIXI container to render into
 */
export function velocityRenderer(spaceObject: SpaceObject, root: PIXI.Container, _selected: boolean): Set<string> {
    const graphics = new PIXI.Graphics();
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.lineTo(spaceObject.velocity.x, spaceObject.velocity.y);

    root.addChild(graphics);
    return propsToTrack;
}
