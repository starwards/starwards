import { Container, Rectangle, Text, TextStyle } from 'pixi.js';
import { SpaceObject, SpaceObjects } from '@starwards/model';

import { CameraView } from './camera-view';

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

export type DrawFunctions = { [T in keyof SpaceObjects]: ObjectRendererFactory<SpaceObjects[T]> };

export function renderText(y: number, value: string[], color: number) {
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
export const blipRenderer = (functions: DrawFunctions) => <T extends SpaceObject>(data: ObjectData<T>) => {
    const renderer = new (functions[data.spaceObject.type] as ObjectRendererFactory<T>)(data);
    return renderer;
};
