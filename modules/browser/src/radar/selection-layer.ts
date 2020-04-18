import { XY, SpaceState, SpaceObject } from '@starwards/model';
import * as PIXI from 'pixi.js';
import { CameraView } from './camera-view';
import { GameRoom } from '../client';
import { SelectionContainer } from './selection-container';

// https://pixijs.io/examples/?v=v5.2.1#/interaction/dragging.js
export class SelectionLayer {
    private static readonly selectionColor = 0x26dafd;
    private static readonly selectPointGrace = 32;

    private dragFrom: XY | null = null;
    private dragTo: XY | null = null;
    private stage = new PIXI.Container();

    constructor(
        private parent: CameraView,
        private room: GameRoom<SpaceState, any>,
        private selectedItems: SelectionContainer
    ) {
        this.stage.interactive = true;
        this.stage.hitArea = new PIXI.Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
        this.parent.events.on('screenChanged', () => {
            this.stage.hitArea = new PIXI.Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
            this.drawSelection();
        });
        this.parent.renderer.plugins.interaction.on('pointerdown', this.onPointerDown);
        this.parent.renderer.plugins.interaction.on('pointermove', this.onPointermove);
        this.parent.renderer.plugins.interaction.on('pointerup', this.onPointerup);
    }

    get renderRoot(): PIXI.DisplayObject {
        return this.stage;
    }

    onSelectPoint(point: XY) {
        const grace = {
            x: SelectionLayer.selectPointGrace / this.parent.camera.zoom,
            y: SelectionLayer.selectPointGrace / this.parent.camera.zoom,
        };
        const from = XY.add(point, XY.negate(grace));
        const to = XY.add(point, grace);
        for (const spaceObject of this.room.state) {
            if (XY.inRange(spaceObject.position, from, to)) {
                this.selectedItems.set([spaceObject]);
                return;
            }
        }
        this.selectedItems.clear();
    }
    onSelectArea(a: XY, b: XY) {
        const from = XY.min(a, b);
        const to = XY.max(a, b);
        const selected = [...this.room.state].filter((spaceObject) => XY.inRange(spaceObject.position, from, to));
        this.selectedItems.set(selected);
    }
    onPointermove = (event: PIXI.interaction.InteractionEvent) => {
        if (this.dragFrom) {
            this.dragTo = event.data.getLocalPosition(this.stage);
            this.drawSelection();
        }
    };

    onPointerDown = (event: PIXI.interaction.InteractionEvent) => {
        this.dragFrom = this.parent.screenToWorld(event.data.getLocalPosition(this.stage));
        this.drawSelection();
    };

    onPointerup = (_event: PIXI.interaction.InteractionEvent) => {
        if (this.dragFrom) {
            if (this.dragTo == null) {
                this.onSelectPoint(this.dragFrom);
            } else {
                const to = this.parent.screenToWorld(this.dragTo);
                this.onSelectArea(this.dragFrom, to);
            }
        }
        this.dragFrom = null;
        this.dragTo = null;
        this.drawSelection();
    };

    private drawSelection() {
        this.stage.removeChildren();
        if (this.dragFrom && this.dragTo) {
            const begin = this.parent.worldToScreen(this.dragFrom);
            const graphics = this.drawSelectionArea(begin, this.dragTo);
            this.stage.addChild(graphics);
        }
    }

    private drawSelectionArea(from: XY, to: XY) {
        const min = XY.min(from, to);
        const absDifference = XY.absDifference(from, to);
        const graphics = new PIXI.Graphics();
        graphics.lineStyle(1, SelectionLayer.selectionColor, 1);
        graphics.beginFill(SelectionLayer.selectionColor, 0.2);
        graphics.drawRect(min.x, min.y, absDifference.x, absDifference.y);
        graphics.endFill();
        return graphics;
    }
}
