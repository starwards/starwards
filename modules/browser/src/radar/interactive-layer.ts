import { XY, SpaceState } from '@starwards/model';
import * as PIXI from 'pixi.js';
import { CameraView } from './camera-view';
import { GameRoom } from '../client';
import { SelectionContainer } from './selection-container';
enum MouseButton {
    none = -1,
    main = 0,
    middle = 1,
    right = 2,
    browserBack = 3,
    browserForward = 4,
}
enum ActionType {
    none,
    select,
    panCamera,
}
export class InteractiveLayer {
    private static readonly selectionColor = 0x26dafd;
    private static readonly selectPointGrace = 32;

    private actionType: ActionType = ActionType.none;
    private dragFrom: XY | null = null;
    private dragTo: XY | null = null;
    private stage = new PIXI.Container();

    constructor(
        private parent: CameraView,
        private room: GameRoom<SpaceState, any>,
        private selectedItems: SelectionContainer
    ) {
        this.stage.cursor = 'crosshair';
        this.stage.interactive = true;
        this.stage.hitArea = new PIXI.Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
        this.parent.events.on('screenChanged', () => {
            this.stage.hitArea = new PIXI.Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
            this.drawSelection();
        });
        // there are issues with click events from multiple mouse buttons: https://github.com/pixijs/pixi.js/issues/5384
        this.parent.renderer.plugins.interaction.on('mousedown', this.onPointerDown);
        this.parent.renderer.plugins.interaction.on('pointerdown', this.onPointerDown);
        this.parent.renderer.plugins.interaction.on('pointermove', this.onPointermove);
        this.parent.renderer.plugins.interaction.on('pointerup', this.onPointerup);
    }

    get renderRoot(): PIXI.DisplayObject {
        return this.stage;
    }

    onSelectPoint(point: XY) {
        const grace = {
            x: InteractiveLayer.selectPointGrace / this.parent.camera.zoom,
            y: InteractiveLayer.selectPointGrace / this.parent.camera.zoom,
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

    onPointerDown = (event: PIXI.interaction.InteractionEvent) => {
        if (this.actionType === ActionType.none) {
            if (event.data.button === MouseButton.main) {
                this.actionType = ActionType.select;
                this.dragFrom = this.parent.screenToWorld(event.data.getLocalPosition(this.stage));
                this.drawSelection();
            } else if (event.data.button === MouseButton.right) {
                this.stage.cursor = 'grab';
                this.actionType = ActionType.panCamera;
                this.dragFrom = event.data.getLocalPosition(this.stage);
            }
        }
    };

    onPointermove = (event: PIXI.interaction.InteractionEvent) => {
        if (this.dragFrom) {
            if (this.actionType === ActionType.select) {
                this.dragTo = event.data.getLocalPosition(this.stage);
                this.drawSelection();
            } else if (this.actionType === ActionType.panCamera) {
                const dragTo = event.data.getLocalPosition(this.stage);
                const screenMove = XY.add(dragTo, XY.negate(this.dragFrom));
                const worldMove = XY.scale(screenMove, -1 / this.parent.camera.zoom);
                this.parent.camera.set(XY.add(this.parent.camera, worldMove));
                // set next drag origin to current mouse position
                this.dragFrom = dragTo;
            }
        }
    };

    onPointerup = (_event: PIXI.interaction.InteractionEvent) => {
        if (this.dragFrom) {
            if (this.actionType === ActionType.select) {
                if (this.dragTo == null) {
                    this.onSelectPoint(this.dragFrom);
                } else {
                    const to = this.parent.screenToWorld(this.dragTo);
                    this.onSelectArea(this.dragFrom, to);
                }
            }
        }
        this.stage.cursor = 'crosshair';
        this.actionType = ActionType.none;
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
        graphics.lineStyle(1, InteractiveLayer.selectionColor, 1);
        graphics.beginFill(InteractiveLayer.selectionColor, 0.2);
        graphics.drawRect(min.x, min.y, absDifference.x, absDifference.y);
        graphics.endFill();
        return graphics;
    }
}
