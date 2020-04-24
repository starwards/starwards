import { SpaceObject, XY } from '@starwards/model';
import * as PIXI from 'pixi.js';
import { NamedGameRoom } from '../client';
import { CameraView } from './camera-view';
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
    dragObjects,
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
        private room: NamedGameRoom<'space'>,
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
        const spaceObject = this.getObjectAtPoint(this.room.state, point);
        if (spaceObject) {
            this.selectedItems.set([spaceObject]);
        } else {
            this.selectedItems.clear();
        }
    }

    onSelectArea(a: XY, b: XY) {
        const from = XY.min(a, b);
        const to = XY.max(a, b);
        const selected = [...this.room.state].filter((spaceObject) => XY.inRange(spaceObject.position, from, to));
        this.selectedItems.set(selected);
    }

    getObjectAtPoint(objects: Iterable<SpaceObject>, pointInWorld: XY): SpaceObject | null {
        // TODO: simplify and refer to object radius by measuring distance?
        const grace = {
            x: InteractiveLayer.selectPointGrace / this.parent.camera.zoom,
            y: InteractiveLayer.selectPointGrace / this.parent.camera.zoom,
        };
        const from = XY.add(pointInWorld, XY.negate(grace));
        const to = XY.add(pointInWorld, grace);
        for (const spaceObject of objects) {
            if (XY.inRange(spaceObject.position, from, to)) {
                return spaceObject;
            }
        }
        return null;
    }

    onPointerDown = (event: PIXI.interaction.InteractionEvent) => {
        if (this.actionType === ActionType.none) {
            if (event.data.button === MouseButton.main) {
                this.dragFrom = event.data.getLocalPosition(this.stage);
                if (
                    this.selectedItems.selectedItems.size > 0 &&
                    this.getObjectAtPoint(this.selectedItems.selectedItems, this.parent.screenToWorld(this.dragFrom))
                ) {
                    this.actionType = ActionType.dragObjects;
                } else {
                    this.actionType = ActionType.select;
                    this.drawSelection();
                }
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
                const screenMove = XY.add(XY.negate(dragTo), this.dragFrom); // camera moves opposite to the drag direction
                const worldMove = XY.scale(screenMove, 1 / this.parent.camera.zoom);
                this.parent.camera.set(XY.add(this.parent.camera, worldMove));
                // set next drag origin to current mouse position
                this.dragFrom = dragTo;
            } else if (this.actionType === ActionType.dragObjects) {
                const dragTo = event.data.getLocalPosition(this.stage);
                const screenMove = XY.add(dragTo, XY.negate(this.dragFrom));
                const worldMove = XY.scale(screenMove, 1 / this.parent.camera.zoom);
                this.room.send('MoveObjects', {
                    ids: [...this.selectedItems.selectedItems].map((o) => o.id),
                    delta: worldMove,
                });
                // set next drag origin to current mouse position
                this.dragFrom = dragTo;
            }
        }
    };

    onPointerup = (_event: PIXI.interaction.InteractionEvent) => {
        if (this.dragFrom) {
            if (this.actionType === ActionType.select) {
                if (this.dragTo == null) {
                    this.onSelectPoint(this.parent.screenToWorld(this.dragFrom));
                } else {
                    const to = this.parent.screenToWorld(this.dragTo);
                    this.onSelectArea(this.parent.screenToWorld(this.dragFrom), to);
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
            const graphics = this.drawSelectionArea(this.dragFrom, this.dragTo);
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
