import { ObjectGraphics, ObjectRendererCtor } from './object-graphics';
import { SpaceObject, SpaceObjects, State } from '@starwards/model';

import { CameraView } from '../camera-view';
import { Container } from 'pixi.js';

export type DrawFunctions = { [T in keyof SpaceObjects]?: ObjectRendererCtor<SpaceObjects[T]> };
export type Selection = { has(o: SpaceObject): boolean };
export type Filter = (o: SpaceObject) => boolean;
export class ObjectsLayer {
    private stage = new Container();
    private graphics = new Map<string, ObjectGraphics<SpaceObject>>();
    constructor(
        private parent: CameraView,
        spaceState: State<'space'>,
        private blipSize: number,
        private getColor: (s: SpaceObject) => number,
        private drawFunctions: DrawFunctions,
        private readonly selectedItems?: Selection,
        private readonly filter?: Filter
    ) {
        spaceState.events.on('add', this.onNewSpaceObject);
        spaceState.events.on('remove', this.onSpaceObjectDestroyed);
        for (const spaceObject of spaceState) {
            this.onNewSpaceObject(spaceObject);
        }
        parent.ticker.add(this.render);
    }

    private render = () => {
        for (const objGraphics of this.graphics.values()) {
            if (objGraphics.shouldRedraw()) {
                this.drawObjectGraphics(objGraphics);
            }
        }
    };

    private drawObjectGraphics(objGraphics: ObjectGraphics<SpaceObject>) {
        if (!this.filter || this.filter(objGraphics.spaceObject)) {
            objGraphics.draw(!!this.selectedItems?.has(objGraphics.spaceObject));
        } // TODO else remove?
    }

    get renderRoot(): Container {
        return this.stage;
    }

    private onSpaceObjectDestroyed = (spaceObject: SpaceObject) => {
        const objGraphics = this.graphics.get(spaceObject.id);
        if (objGraphics) {
            objGraphics.destroy();
            this.stage.removeChild(objGraphics.stage);
            this.graphics.delete(spaceObject.id);
        }
    };
    private onNewSpaceObject = <T extends SpaceObject>(spaceObject: T) => {
        const rendererCtor = this.drawFunctions[spaceObject.type] as ObjectRendererCtor<T>;
        if (!spaceObject.destroyed && rendererCtor) {
            const objGraphics = new ObjectGraphics<typeof spaceObject>(
                spaceObject,
                rendererCtor,
                this.parent,
                this.blipSize,
                this.getColor(spaceObject)
            );
            this.graphics.set(spaceObject.id, objGraphics);
            this.stage.addChild(objGraphics.stage);
            this.drawObjectGraphics(objGraphics);
        }
    };
}
