import { DrawFunctions, ObjectData, ObjectRendererFactory, SpaceObjectRenderer } from './blip-renderer';
import { SpaceObject, State } from '@starwards/model';

import { CameraView } from '../camera-view';
import { Container } from 'pixi.js';
import { SelectionContainer } from '../selection-container';

export class ObjectsLayer {
    private stage = new Container();
    private graphics = new Map<string, ObjectGraphics>();
    constructor(
        private parent: CameraView,
        spaceState: State<'space'>,
        private drawFunctions: DrawFunctions,
        private selectedItems: SelectionContainer
    ) {
        spaceState.events.on('add', (spaceObject: SpaceObject) => this.onNewSpaceObject(spaceObject));
        spaceState.events.on('remove', (spaceObject: SpaceObject) => this.cleanupSpaceObject(spaceObject.id));

        for (const spaceObject of spaceState) {
            this.onNewSpaceObject(spaceObject);
        }
        parent.ticker.add(this.render);
    }

    private render = () => {
        for (const objGraphics of this.graphics.values()) {
            if (objGraphics.isDestroyed()) {
                this.cleanupSpaceObject(objGraphics.spaceObject.id);
            } else {
                objGraphics.redraw(this.selectedItems.has(objGraphics.spaceObject));
            }
        }
    };

    get renderRoot(): Container {
        return this.stage;
    }

    private onNewSpaceObject(spaceObject: SpaceObject) {
        if (!spaceObject.destroyed && this.drawFunctions[spaceObject.type]) {
            const objGraphics = new ObjectGraphics(spaceObject, this.drawFunctions[spaceObject.type], this.parent);
            this.graphics.set(spaceObject.id, objGraphics);
            this.stage.addChild(objGraphics.stage);
        }
    }

    private cleanupSpaceObject(id: string) {
        const objGraphics = this.graphics.get(id);
        if (objGraphics) {
            this.graphics.delete(id);
            objGraphics.destroy();
        }
    }
}

/**
 * internal class
 */
// eslint-disable-next-line: max-classes-per-file
class ObjectGraphics implements ObjectData<SpaceObject> {
    public stage = new Container(); // stage's position is the object's position
    private destroyed = false;
    public isSelected = false;
    private renderer: SpaceObjectRenderer;
    constructor(public spaceObject: SpaceObject, rendererCtor: ObjectRendererFactory, public parent: CameraView) {
        this.renderer = new rendererCtor(this);
    }

    isDestroyed() {
        return this.spaceObject.destroyed || this.destroyed;
    }

    isInStage() {
        return (
            this.stage.x + this.stage.width > 0 &&
            this.stage.y + this.stage.height > 0 &&
            this.stage.x - this.stage.width < this.parent.renderer.width &&
            this.stage.y - this.stage.height < this.parent.renderer.height
        );
    }

    redraw(isSelected: boolean) {
        this.isSelected = isSelected;
        const pos = this.parent.worldToScreen(this.spaceObject.position);
        this.stage.x = pos.x;
        this.stage.y = pos.y;
        if (this.isInStage()) {
            this.renderer.redraw();
        }
    }

    destroy() {
        if (!this.destroyed) {
            this.stage.parent.removeChild(this.stage);
            this.stage.destroy({
                children: true,
            });
            this.destroyed = true;
        }
    }
}
