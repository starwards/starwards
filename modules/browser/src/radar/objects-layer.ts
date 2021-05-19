import { ObjectData, SpaceObjectRenderer } from './blip-renderer';
import { SpaceObject, State } from '@starwards/model';

import { CameraView } from './camera-view';
import { Container } from 'pixi.js';
import EventEmitter from 'eventemitter3';
import { SelectionContainer } from './selection-container';

export type MakeRenderer = (data: ObjectData<SpaceObject>) => SpaceObjectRenderer;
export class ObjectsLayer {
    private stage = new Container();
    private graphics: { [id: string]: ObjectGraphics } = {};
    private toReDraw = new Set<ObjectGraphics>();
    constructor(
        private parent: CameraView,
        private spaceState: State<'space'>,
        private makeRenderer: MakeRenderer,
        private selectedItems: SelectionContainer
    ) {
        spaceState.events.on('add', (spaceObject: SpaceObject) => this.onNewSpaceObject(spaceObject));
        spaceState.events.on('remove', (spaceObject: SpaceObject) => this.cleanupSpaceObject(spaceObject.id));

        for (const spaceObject of spaceState) {
            this.onNewSpaceObject(spaceObject);
        }
        parent.ticker.add(this.onRender);
    }

    private onRender = () => {
        for (const objGraphics of this.toReDraw) {
            if (objGraphics.isDestroyed()) {
                this.cleanupSpaceObject(objGraphics.spaceObject.id);
            } else {
                objGraphics.updatePosition();
                if (objGraphics.shouldRedraw()) {
                    objGraphics.redraw(this.selectedItems.has(objGraphics.spaceObject));
                }
            }
        }
        this.toReDraw.clear();
    };

    get renderRoot(): Container {
        return this.stage;
    }

    private onNewSpaceObject(spaceObject: SpaceObject) {
        if (!spaceObject.destroyed) {
            const objGraphics = new ObjectGraphics(spaceObject, this.makeRenderer, this.parent);
            this.graphics[spaceObject.id] = objGraphics;
            this.stage.addChild(objGraphics.stage);
            objGraphics.listen(this.parent.events as EventEmitter, 'screenChanged', () => {
                this.toReDraw.add(objGraphics);
            });
            objGraphics.listen(this.parent.events as EventEmitter, 'angleChanged', () => {
                this.toReDraw.add(objGraphics);
            });
            objGraphics.listen(this.spaceState.events, spaceObject.id, () => {
                this.toReDraw.add(objGraphics);
            });
            objGraphics.listen(this.selectedItems.events, spaceObject.id, () => {
                this.toReDraw.add(objGraphics);
            });
        }
    }

    private cleanupSpaceObject(id: string) {
        const objGraphics = this.graphics[id];
        if (objGraphics) {
            delete this.graphics[id];
            objGraphics.destroy();
            this.toReDraw.delete(objGraphics);
        }
    }
}

/**
 * internal class
 */
// eslint-disable-next-line: max-classes-per-file
class ObjectGraphics implements ObjectData<SpaceObject> {
    public stage = new Container(); // stage's position is the object's position
    private disposables: Array<() => void> = [];
    private destroyed = false;
    public isSelected = false;
    private renderer: SpaceObjectRenderer;
    constructor(public spaceObject: SpaceObject, makeRenderer: MakeRenderer, public parent: CameraView) {
        this.updatePosition();
        this.renderer = makeRenderer(this);
    }

    isDestroyed() {
        return this.spaceObject.destroyed || this.destroyed;
    }

    shouldRedraw() {
        if (
            this.stage.x + this.stage.width < 0 ||
            this.stage.y + this.stage.height < 0 ||
            this.stage.x - this.stage.width > this.parent.renderer.width ||
            this.stage.y - this.stage.height > this.parent.renderer.height
        ) {
            // outside of screen bounds, skip render
            return false;
        }
        return true;
    }

    updatePosition() {
        if (!this.isDestroyed()) {
            const pos = this.parent.worldToScreen(this.spaceObject.position);
            this.stage.x = pos.x;
            this.stage.y = pos.y;
        }
    }

    redraw(isSelected: boolean) {
        this.isSelected = isSelected;
        if (!this.isDestroyed()) {
            this.renderer.redraw();
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen(events: EventEmitter, event: string, listener: (...args: any[]) => any) {
        if (!this.isDestroyed()) {
            events.on(event, listener);
            this.disposables.push(() => events.off(event, listener));
        }
    }

    destroy() {
        if (!this.destroyed) {
            this.stage.parent.removeChild(this.stage);
            this.stage.destroy({
                children: true,
            });
            for (const d of this.disposables) {
                d();
            }
            this.destroyed = true;
        }
    }
}
