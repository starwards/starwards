import { Container, UPDATE_PRIORITY } from 'pixi.js';
import { ObjectGraphics, ObjectRendererCtor } from './object-graphics';
import { SpaceDriver, SpaceObject, SpaceObjects } from '@starwards/core';

import { CameraView } from '../camera-view';
import { TrackObjects } from '../track-objects';

type DrawFunctions<K extends keyof SpaceObjects> = {
    [T in K]: ObjectRendererCtor<SpaceObjects[T]>;
};
type Selection = { has(o: SpaceObject): boolean };
type Filter<K extends keyof SpaceObjects> = (o: SpaceObjects[K]) => boolean;
export class ObjectsLayer<K extends keyof SpaceObjects = keyof SpaceObjects> {
    private stage = new Container();

    private createGraphics = <T extends SpaceObjects[K]>(spaceObject: T) => {
        const rendererCtor = this.drawFunctions[spaceObject.type as K] as ObjectRendererCtor<T>;
        const objGraphics = new ObjectGraphics<T>(
            spaceObject,
            rendererCtor,
            this.parent,
            this.blipSize,
            this.getColor(spaceObject)
        );
        objGraphics.update();
        this.stage.addChild(objGraphics.stage);
        return objGraphics;
    };
    private updateGraphics = (_o: SpaceObject, g: ObjectGraphics) => g.update();
    private destroyGraphics = (g: ObjectGraphics) => {
        g.destroy();
        this.stage.removeChild(g.stage);
    };
    private shouldTrack = (o: SpaceObject): o is SpaceObjects[K] =>
        !o.destroyed && !!this.drawFunctions[o.type as K] && (!this.filter || this.filter(o as SpaceObjects[K]));

    public graphics = new TrackObjects<ObjectGraphics<SpaceObjects[K]>, SpaceObjects[K]>(
        this.spaceDriver,
        this.createGraphics,
        this.updateGraphics,
        this.destroyGraphics,
        this.shouldTrack
    );

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
        private blipSize: number,
        private getColor: (s: SpaceObjects[K]) => number,
        private drawFunctions: DrawFunctions<K>,
        private readonly selectedItems?: Selection,
        private readonly filter?: Filter<K>
    ) {
        parent.ticker.add(this.render, null, UPDATE_PRIORITY.LOW);
    }

    private render = () => {
        this.graphics.update();
        for (const objGraphics of this.graphics.values()) {
            if (objGraphics.shouldRedraw()) {
                objGraphics.draw(!!this.selectedItems?.has(objGraphics.spaceObject));
            }
        }
    };

    get renderRoot(): Container {
        return this.stage;
    }
}
