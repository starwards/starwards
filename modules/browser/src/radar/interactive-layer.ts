import { Container, DisplayObject, FederatedPointerEvent, Graphics, Rectangle } from 'pixi.js';
import { SpaceObject, XY, spaceProperties } from '@starwards/core';

import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';
import { SpaceDriver } from '@starwards/core';
import { selectionColor } from '../colors';

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
    panCameraOrOrder,
    panCamera,
    dragObjects,
}
export class InteractiveLayer {
    private static readonly selectPointGrace = 32;

    private actionType: ActionType = ActionType.none;
    private dragFrom: XY | null = null;
    private dragTo: XY | null = null;
    private stage = new Container();

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
        private selectionContainer: SelectionContainer
    ) {
        this.stage.cursor = 'crosshair';
        this.stage.interactive = true;
        this.stage.hitArea = new Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
        this.parent.events.on('screenChanged', () => {
            this.stage.hitArea = new Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
            this.drawSelection();
        });
        this.stage.on('pointerdown', this.onPointerDown);
        this.stage.on('pointermove', this.onPointermove);
        this.stage.on('pointerup', this.onPointerup);
    }

    get renderRoot(): DisplayObject {
        return this.stage;
    }

    onSelectPoint(point: XY) {
        const spaceObject = this.getObjectAtPoint(this.spaceDriver.state, point);
        if (spaceObject) {
            this.selectionContainer.set([spaceObject]);
        } else {
            this.selectionContainer.clear();
        }
    }

    onSelectArea(a: XY, b: XY) {
        const from = XY.min(a, b);
        const to = XY.max(a, b);
        const selected = [...this.spaceDriver.state].filter((spaceObject) =>
            XY.inRange(spaceObject.position, from, to)
        );
        this.selectionContainer.set(selected);
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

    onPointerDown = (event: FederatedPointerEvent) => {
        if (this.actionType === ActionType.none) {
            if (event.button === (MouseButton.main as number)) {
                this.dragFrom = XY.clone(event.global);
                if (
                    this.selectionContainer.size > 0 &&
                    this.getObjectAtPoint(
                        this.selectionContainer.selectedItems,
                        this.parent.screenToWorld(this.dragFrom)
                    )
                ) {
                    this.actionType = ActionType.dragObjects;
                } else {
                    this.actionType = ActionType.select;
                    this.drawSelection();
                }
            } else if (event.button === (MouseButton.right as number)) {
                this.actionType = ActionType.panCameraOrOrder;
                this.dragFrom = XY.clone(event.global);
            }
        }
    };

    onPointermove = (event: FederatedPointerEvent) => {
        if (this.dragFrom) {
            if (this.actionType === ActionType.select) {
                this.dragTo = XY.clone(event.global);
                this.drawSelection();
            } else if (this.actionType === ActionType.panCamera || this.actionType === ActionType.panCameraOrOrder) {
                this.actionType = ActionType.panCamera;
                this.stage.cursor = 'grab';
                const dragTo = XY.clone(event.global);
                const screenMove = XY.difference(this.dragFrom, dragTo); // camera moves opposite to the drag direction
                const worldMove = XY.scale(screenMove, 1 / this.parent.camera.zoom);
                this.parent.camera.set(XY.add(this.parent.camera, worldMove));
                // set next drag origin to current mouse position
                this.dragFrom = dragTo;
            } else if (this.actionType === ActionType.dragObjects) {
                const dragTo = XY.clone(event.global);
                const screenMove = XY.difference(dragTo, this.dragFrom);
                const worldMove = XY.scale(screenMove, 1 / this.parent.camera.zoom);
                this.spaceDriver.command(spaceProperties.bulkMove, {
                    ids: this.selectionContainer.selectedItemsIds,
                    delta: worldMove,
                });
                // set next drag origin to current mouse position
                this.dragFrom = dragTo;
            }
        }
    };

    onPointerup = (_event: FederatedPointerEvent) => {
        if (this.dragFrom) {
            if (this.actionType === ActionType.select) {
                if (this.dragTo == null) {
                    this.onSelectPoint(this.parent.screenToWorld(this.dragFrom));
                } else {
                    const to = this.parent.screenToWorld(this.dragTo);
                    this.onSelectArea(this.parent.screenToWorld(this.dragFrom), to);
                }
            } else if (this.actionType === ActionType.panCameraOrOrder || this.actionType === ActionType.panCamera) {
                const position = this.parent.screenToWorld(this.dragFrom);
                const spaceObject = this.getObjectAtPoint(this.spaceDriver.state, position);
                if (spaceObject) {
                    this.spaceDriver.command(spaceProperties.bulkBotOrder, {
                        ids: this.selectionContainer.selectedItemsIds,
                        order: {
                            type: 'attack',
                            targetId: spaceObject.id,
                        },
                    });
                } else {
                    this.spaceDriver.command(spaceProperties.bulkBotOrder, {
                        ids: this.selectionContainer.selectedItemsIds,
                        order: {
                            type: 'move',
                            position,
                        },
                    });
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
        const graphics = new Graphics();
        graphics.lineStyle(1, selectionColor, 1);
        graphics.beginFill(selectionColor, 0.2);
        graphics.drawRect(min.x, min.y, absDifference.x, absDifference.y);
        graphics.endFill();
        return graphics;
    }
}
