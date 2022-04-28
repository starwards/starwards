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
        spaceState.events.on('add', (spaceObject: SpaceObject) => this.onNewSpaceObject(spaceObject));
        spaceState.events.on('remove', (spaceObject: SpaceObject) => this.graphics.get(spaceObject.id)?.destroy());

        for (const spaceObject of spaceState) {
            this.onNewSpaceObject(spaceObject);
        }
        parent.ticker.add(this.render);
    }

    private render = () => {
        for (const objGraphics of this.graphics.values()) {
            this.redrawObjectGraphics(objGraphics);
        }
    };

    private redrawObjectGraphics(objGraphics: ObjectGraphics<SpaceObject>) {
        if (!this.filter || this.filter(objGraphics.spaceObject)) {
            objGraphics.redraw(!!this.selectedItems?.has(objGraphics.spaceObject));
        }
    }

    get renderRoot(): Container {
        return this.stage;
    }

    private onNewSpaceObject<T extends SpaceObject>(spaceObject: T) {
        const rendererCtor = this.drawFunctions[spaceObject.type] as ObjectRendererCtor<T>;
        if (!spaceObject.destroyed && rendererCtor) {
            const objGraphics = new ObjectGraphics<typeof spaceObject>(
                spaceObject,
                rendererCtor,
                this.parent,
                () => this.graphics.delete(spaceObject.id),
                this.blipSize,
                this.getColor(spaceObject)
            );
            this.graphics.set(spaceObject.id, objGraphics);
            this.stage.addChild(objGraphics.stage);
            this.redrawObjectGraphics(objGraphics);
        }
    }
}
