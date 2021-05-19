import { DrawFunctions, ObjectData, ObjectRendererFactory, SpaceObjectRenderer } from './blip-renderer';
import { SpaceObject, State } from '@starwards/model';

import { CameraView } from '../camera-view';
import { Container } from 'pixi.js';
import { SelectionContainer } from '../selection-container';

export class ObjectsLayer {
    private stage = new Container();
    private graphics = new Map<string, ObjectGraphics<SpaceObject>>();
    constructor(
        private parent: CameraView,
        spaceState: State<'space'>,
        private drawFunctions: DrawFunctions,
        private selectedItems: SelectionContainer
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
            objGraphics.redraw(this.selectedItems.has(objGraphics.spaceObject));
        }
    };

    get renderRoot(): Container {
        return this.stage;
    }

    private onNewSpaceObject<T extends SpaceObject>(spaceObject: T) {
        const rendererCtor = this.drawFunctions[spaceObject.type] as ObjectRendererFactory<T>;
        if (!spaceObject.destroyed && rendererCtor) {
            const objGraphics = new ObjectGraphics<typeof spaceObject>(spaceObject, rendererCtor, this.parent, () =>
                this.graphics.delete(spaceObject.id)
            );
            this.graphics.set(spaceObject.id, objGraphics);
            this.stage.addChild(objGraphics.stage);
        }
    }
}

/**
 * internal class
 */
// eslint-disable-next-line: max-classes-per-file
class ObjectGraphics<T extends SpaceObject> implements ObjectData<T> {
    public stage = new Container(); // stage's position is the object's position
    public isSelected = false;
    private renderer: SpaceObjectRenderer;
    constructor(
        public spaceObject: T,
        rendererCtor: ObjectRendererFactory<T>,
        public parent: CameraView,
        private onDestroyed: () => unknown
    ) {
        this.renderer = new rendererCtor(this);
    }

    private isInStage() {
        return (
            this.stage.x + this.stage.width > 0 &&
            this.stage.y + this.stage.height > 0 &&
            this.stage.x - this.stage.width < this.parent.renderer.width &&
            this.stage.y - this.stage.height < this.parent.renderer.height
        );
    }

    redraw(isSelected: boolean) {
        if (this.spaceObject.destroyed) {
            this.destroy();
        } else {
            this.isSelected = isSelected;
            const { x, y } = this.parent.worldToScreen(this.spaceObject.position);
            this.stage.x = x;
            this.stage.y = y;
            if (this.isInStage()) {
                this.renderer.redraw();
            }
        }
    }

    destroy() {
        this.onDestroyed();
        this.stage.parent.removeChild(this.stage);
        this.stage.destroy({
            children: true,
        });
    }
}
