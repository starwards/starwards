// tslint:disable-next-line: no-implicit-dependencies
import { DataChange } from '@colyseus/schema';
import { SpaceObject, SpaceState, XY } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import * as PIXI from 'pixi.js';
import { GameRoom } from '../client';
import { blipRenderer } from './blip-renderer';
import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';

export class BlipsLayer {
    private stage = new PIXI.Container();
    private blips: { [id: string]: Blip } = {};
    constructor(
        private parent: CameraView,
        private room: GameRoom<SpaceState, any>,
        private selectedItems: SelectionContainer
    ) {
        // assume single spaceship, this is the center of the radar
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
        const blip = new Blip(spaceObject, this.parent.worldToScreen);
        this.blips[spaceObject.id] = blip;
        this.stage.addChild(blip.stage);
        blip.listen(this.parent.events as EventEmitter, 'screenChanged', () => blip.updatePosition());
        blip.listen(this.room.state.events, spaceObject.id, (changes: DataChange[]) => {
            const redraw = changes.reduce((r, change) => blip.onFieldChange(change.field) || r, false);
            if (redraw) {
                blip.redraw(this.selectedItems.has(spaceObject));
            }
        });
        blip.listen(this.selectedItems.events, spaceObject.id, () => blip.redraw(this.selectedItems.has(spaceObject)));
    }

    private onRemoveSpaceObject(id: string) {
        const blip = this.blips[id];
        delete this.blips[id];
        blip.destroy();
    }
}

/**
 * internal class
 */
// tslint:disable-next-line: max-classes-per-file
class Blip {
    public stage = new PIXI.Container();
    private renderedProperties = new Set<string>();
    private disposables: Array<() => void> = [];
    constructor(private spaceObject: SpaceObject, private worldToScreen: (w: XY) => XY) {
        this.updatePosition();
        this.redraw(false);
    }

    updatePosition() {
        const pos = this.worldToScreen(this.spaceObject.position);
        this.stage.x = pos.x;
        this.stage.y = pos.y;
    }

    redraw(isSelected: boolean) {
        // re-draw blip
        this.stage.removeChildren();
        this.renderedProperties = blipRenderer(this.spaceObject, this.stage, isSelected);
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
        this.stage.destroy();
    }
}
