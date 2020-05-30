// tslint:disable-next-line: no-implicit-dependencies
import { DataChange } from '@colyseus/schema';
import { SpaceObject, SpaceState, XY } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import * as PIXI from 'pixi.js';
import { GameRoom } from '../client';
import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';

export type ObjectRenderer = (spaceObject: SpaceObject, root: PIXI.Container, selected: boolean) => Set<string>;
export class ObjectsLayer {
    private stage = new PIXI.Container();
    private graphics: { [id: string]: ObjectGraphics } = {};
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
    }

    get renderRoot(): PIXI.DisplayObject {
        return this.stage;
    }

    private onNewSpaceObject(spaceObject: SpaceObject) {
        const objGraphics = new ObjectGraphics(spaceObject, this.renderer, this.parent.worldToScreen);
        this.graphics[spaceObject.id] = objGraphics;
        this.stage.addChild(objGraphics.stage);
        objGraphics.listen(this.parent.events as EventEmitter, 'screenChanged', () => objGraphics.updatePosition());
        objGraphics.listen(this.room.state.events, spaceObject.id, (changes: DataChange[]) => {
            if (changes.some((change) => change.field === 'destroyed' && change.value === true)) {
                this.onRemoveSpaceObject(spaceObject.id);
            } else {
                const redraw = changes.reduce((r, change) => objGraphics.onFieldChange(change.field) || r, false);
                if (redraw) {
                    objGraphics.redraw(this.selectedItems.has(spaceObject));
                }
            }
        });
        objGraphics.listen(this.selectedItems.events, spaceObject.id, () =>
            objGraphics.redraw(this.selectedItems.has(spaceObject))
        );
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
    private disposables: Array<() => void> = [];
    constructor(
        private spaceObject: SpaceObject,
        private renderer: ObjectRenderer,
        private worldToScreen: (w: XY) => XY
    ) {
        this.stage.addChild(this.drawRoot);
        this.updatePosition();
        this.redraw(false);
    }

    updatePosition() {
        const pos = this.worldToScreen(this.spaceObject.position);
        this.stage.x = pos.x;
        this.stage.y = pos.y;
    }

    redraw(isSelected: boolean) {
        // re-draw
        this.stage.removeChildren();
        this.drawRoot.destroy({
            children: true,
        });
        this.drawRoot = new PIXI.Container();
        this.stage.addChild(this.drawRoot);
        this.renderedProperties = this.renderer(this.spaceObject, this.drawRoot, isSelected);
    }

    onFieldChange(field: string): boolean {
        if (field === 'position') {
            this.updatePosition();
        }
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
