import { Container, UPDATE_PRIORITY } from 'pixi.js';
import { ObjectGraphics, ObjectRendererCtor } from './object-graphics';
import { SpaceObject, SpaceObjects } from '@starwards/model';

import { CameraView } from '../camera-view';
import { SpaceDriver } from '../../driver';
import { TrackObjects } from '../../driver/space';

export type DrawFunctions = { [T in keyof SpaceObjects]?: ObjectRendererCtor<SpaceObjects[T]> };
export type Selection = { has(o: SpaceObject): boolean };
export type Filter = (o: SpaceObject) => boolean;
export class ObjectsLayer {
    private stage = new Container();

    private createGraphics = <T extends SpaceObject>(spaceObject: T) => {
        const rendererCtor = this.drawFunctions[spaceObject.type] as ObjectRendererCtor<T>;
        const objGraphics = new ObjectGraphics<typeof spaceObject>(
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
    private shouldTrack = (o: SpaceObject) =>
        !o.destroyed && !!this.drawFunctions[o.type] && (!this.filter || this.filter(o));

    public graphics = new TrackObjects<ObjectGraphics>(
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
        private getColor: (s: SpaceObject) => number,
        private drawFunctions: DrawFunctions,
        private readonly selectedItems?: Selection,
        private readonly filter?: Filter
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
