import { Container, Rectangle, Text, TextStyle } from 'pixi.js';
import { SpaceObject, SpaceObjects } from '@starwards/model';

import { CameraView } from '../camera-view';

export interface ObjectData<T extends SpaceObject> {
    parent: CameraView;
    spaceObject: T;
    stage: Container;
    isSelected: boolean;
}

export interface ObjectRendererFactory<T extends SpaceObject> {
    new (data: ObjectData<T>): SpaceObjectRenderer;
}
export interface SpaceObjectRenderer {
    redraw(): void;
}

export type DrawFunctions = { [T in keyof SpaceObjects]?: ObjectRendererFactory<SpaceObjects[T]> };

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
