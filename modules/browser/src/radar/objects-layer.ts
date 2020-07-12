// tslint:disable-next-line: no-implicit-dependencies
import { DataChange } from '@colyseus/schema';
import { SpaceObject, SpaceState } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import * as PIXI from 'pixi.js';
import { GameRoom } from '../client';
import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';

export type ObjectRenderer = (
    spaceObject: SpaceObject,
    root: PIXI.Container,
    selected: boolean,
    angle: number
) => Set<string>;
export class ObjectsLayer {
    private stage = new PIXI.Container();
    private graphics: { [id: string]: ObjectGraphics } = {};
    private toReDraw = new Set<ObjectGraphics>();
    constructor(
        private parent: CameraView,
        private room: GameRoom<SpaceState, any>,
        private renderer: ObjectRenderer,
        private selectedItems: SelectionContainer
    ) {
        room.state.events.on('add', (spaceObject: SpaceObject) => this.onNewSpaceObject(spaceObject));
        room.state.events.on('remove', (spaceObject: SpaceObject) => this.onRemoveSpaceObject(spaceObject.id));

        for (const spaceObject of room.state) {
            this.onNewSpaceObject(spaceObject);
        }
        parent.ticker.add((_delta) => {
            for (const objGraphics of this.toReDraw) {
                if (objGraphics.spaceObject.destroyed) {
                    this.onRemoveSpaceObject(objGraphics.spaceObject.id);
                } else {
                    objGraphics.updatePosition();
                    if (objGraphics.shouldRedraw()) {
                        objGraphics.redraw(this.selectedItems.has(objGraphics.spaceObject));
                    }
                }
            }
            this.toReDraw.clear();
        });
    }

    get renderRoot(): PIXI.DisplayObject {
        return this.stage;
    }

    private onNewSpaceObject(spaceObject: SpaceObject) {
        const objGraphics = new ObjectGraphics(spaceObject, this.renderer, this.parent);
        this.graphics[spaceObject.id] = objGraphics;
        this.stage.addChild(objGraphics.stage);
        objGraphics.listen(this.parent.events as EventEmitter, 'screenChanged', () => {
            this.toReDraw.add(objGraphics);
        });
        objGraphics.listen(this.parent.events as EventEmitter, 'angleChanged', () => {
            objGraphics.markChanged(['parentAngle']);
            this.toReDraw.add(objGraphics);
        });
        objGraphics.listen(this.room.state.events, spaceObject.id, (changes: DataChange[]) => {
            objGraphics.markChanged(changes.map((c) => c.field));
            this.toReDraw.add(objGraphics);
        });
        objGraphics.listen(this.selectedItems.events, spaceObject.id, () => {
            objGraphics.markChanged(['selected']);
            this.toReDraw.add(objGraphics);
        });
    }

    private onRemoveSpaceObject(id: string) {
        const objGraphics = this.graphics[id];
        if (objGraphics) {
            delete this.graphics[id];
            objGraphics.destroy();
        }
    }
}

/**
 * internal class
 */
// tslint:disable-next-line: max-classes-per-file
class ObjectGraphics {
    public stage = new PIXI.Container();
    private drawRoot = new PIXI.Container();
    private renderedProperties = new Set<string>();
    private dirtyProperties = new Set<string>();
    private disposables: Array<() => void> = [];
    constructor(public spaceObject: SpaceObject, private renderer: ObjectRenderer, private parent: CameraView) {
        this.stage.addChild(this.drawRoot);
        this.updatePosition();
        this.redraw(false);
    }

    markChanged(fields: string[]) {
        for (const field of fields) {
            this.dirtyProperties.add(field);
        }
    }

    shouldRedraw() {
        if (
            this.stage.x + this.stage.width < 0 &&
            this.stage.y + this.stage.height < 0 &&
            this.stage.x > this.parent.renderer.width &&
            this.stage.y > this.parent.renderer.height
        ) {
            // outside of screen bounds, skip render (but keep dirtyProperties for when it enters the screen)
            return false;
        }
        const dirtyProperties = this.dirtyProperties;
        this.dirtyProperties = new Set();
        for (const field of this.renderedProperties) {
            if (dirtyProperties.has(field)) {
                return true;
            }
        }
        return false;
    }

    updatePosition() {
        const pos = this.parent.worldToScreen(this.spaceObject.position);
        this.stage.x = pos.x;
        this.stage.y = pos.y;
    }

    redraw(isSelected: boolean) {
        // TODO only apply changes (dont re-create)
        this.stage.removeChildren();
        this.drawRoot.destroy({
            children: true,
        });
        this.drawRoot = new PIXI.Container();
        this.stage.addChild(this.drawRoot);
        this.renderedProperties = this.renderer(this.spaceObject, this.drawRoot, isSelected, this.parent.camera.angle);
    }

    shouldRedrawOnFieldChange(field: string): boolean {
        return this.renderedProperties.has(field);
    }

    listen(events: EventEmitter, event: string, listener: (...args: any[]) => any) {
        events.on(event, listener);
        this.disposables.push(() => events.off(event, listener));
    }

    destroy() {
        for (const d of this.disposables) {
            d();
        }
        this.stage.parent.removeChild(this.stage);
        this.stage.destroy({
            children: true,
        });
    }
}
