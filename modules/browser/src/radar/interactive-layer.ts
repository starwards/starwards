import { Container, DisplayObject, FederatedPointerEvent, Graphics, Rectangle } from 'pixi.js';
import { CreateObjectsContainer, CreateTemplate } from './create-objects-container';
import {
    Iterator,
    SpaceObject,
    Spaceship,
    XY,
    assertUnreachable,
    lerp,
    literal2Range,
    spaceCommands,
} from '@starwards/core';

import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';
import { SpaceDriver } from '@starwards/core';
import hotkeys from 'hotkeys-js';
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
    create,
}
enum SelectModifier {
    replace,
    add,
    subtract,
}
const defaultCursor = 'crosshair';
const panCameraCursor = 'grab';
const createCursor = 'cell';
export class InteractiveLayer {
    private static readonly selectPointGrace = 32;

    private actionType: ActionType = ActionType.none;
    private dragFrom: XY | null = null;
    private dragTo: XY | null = null;
    private createTemplate: CreateTemplate | null = null;
    private stage = new Container();

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
        private selectionContainer: SelectionContainer,
        private createContainer: CreateObjectsContainer,
    ) {
        this.stage.cursor = defaultCursor;
        this.stage.interactive = true;
        this.stage.hitArea = new Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
        this.parent.events.on('screenChanged', () => {
            this.stage.hitArea = new Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
            this.drawSelection();
        });
        this.createContainer.events.on('createByTemplate', this.onCreateByTemplate);
        this.createContainer.events.on('cancel', this.onCancelCreate);
        this.stage.on('pointerdown', this.onPointerDown);
        this.stage.on('pointermove', this.onPointermove);
        this.stage.on('pointerup', this.onPointerup);
    }

    get renderRoot(): DisplayObject {
        return this.stage;
    }

    onSelectPoint(modifier: SelectModifier, point: XY) {
        const spaceObject = this.getObjectAtPoint(this.spaceDriver.state, point);
        if (spaceObject) {
            const selected = [spaceObject];
            if (modifier === SelectModifier.replace) this.selectionContainer.set(selected);
            else if (modifier === SelectModifier.add) this.selectionContainer.add(selected);
            else if (modifier === SelectModifier.subtract) this.selectionContainer.remove(selected);
        } else if (modifier === SelectModifier.replace) {
            this.selectionContainer.clear();
        }
    }

    onSelectArea(modifier: SelectModifier, a: XY, b: XY) {
        const from = XY.min(a, b);
        const to = XY.max(a, b);
        const selected = [...this.spaceDriver.state].filter((spaceObject) =>
            XY.inRange(spaceObject.position, from, to),
        );
        if (modifier === SelectModifier.replace) this.selectionContainer.set(selected);
        else if (modifier === SelectModifier.add) this.selectionContainer.add(selected);
        else if (modifier === SelectModifier.subtract) this.selectionContainer.remove(selected);
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

    onCancelCreate = () => {
        if (this.actionType === ActionType.create) this.clearAction();
    };

    onCreateByTemplate = (template: CreateTemplate) => {
        this.clearAction();
        this.actionType = ActionType.create;
        this.stage.cursor = createCursor;
        this.createTemplate = template;
    };

    onPointerDown = (event: FederatedPointerEvent) => {
        const isMainButton = event.button === (MouseButton.main as number);
        if (this.actionType === ActionType.none) {
            if (isMainButton) {
                this.dragFrom = XY.clone(event.global);
                if (
                    this.selectionContainer.size > 0 &&
                    this.getObjectAtPoint(
                        this.selectionContainer.selectedItems,
                        this.parent.screenToWorld(this.dragFrom),
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
        } else if (this.actionType === ActionType.create && isMainButton) {
            this.dragFrom = XY.clone(event.global);
        }
    };

    onPointermove = (event: FederatedPointerEvent) => {
        if (this.dragFrom) {
            if (this.actionType === ActionType.select) {
                this.dragTo = XY.clone(event.global);
                this.drawSelection();
            } else if (this.actionType === ActionType.panCamera || this.actionType === ActionType.panCameraOrOrder) {
                this.actionType = ActionType.panCamera;
                this.stage.cursor = panCameraCursor;
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
                this.spaceDriver.command(spaceCommands.bulkMove, {
                    ids: this.selectionContainer.selectedItemsIds,
                    delta: worldMove,
                });
                // set next drag origin to current mouse position
                this.dragFrom = dragTo;
            }
        }
    };

    onPointerup = (event: FederatedPointerEvent) => {
        if (this.dragFrom) {
            if (this.actionType === ActionType.select) {
                const modifier = hotkeys.ctrl
                    ? SelectModifier.add
                    : hotkeys.alt
                      ? SelectModifier.subtract
                      : SelectModifier.replace;
                if (this.dragTo == null) {
                    this.onSelectPoint(modifier, this.parent.screenToWorld(this.dragFrom));
                } else {
                    const to = this.parent.screenToWorld(this.dragTo);
                    this.onSelectArea(modifier, this.parent.screenToWorld(this.dragFrom), to);
                }
            } else if (this.actionType === ActionType.create && this.createTemplate) {
                const position = this.parent.screenToWorld(event.global);
                if (this.createTemplate.type === 'Asteroid') {
                    const radius = lerp([0, 1], literal2Range(this.createTemplate.radius), Math.random());
                    this.spaceDriver.command(spaceCommands.createAsteroidOrder, { position, radius });
                } else if (this.createTemplate.type === 'Spaceship') {
                    const { isPlayerShip, shipModel, faction } = this.createTemplate;
                    this.spaceDriver.command(spaceCommands.createSpaceshipOrder, {
                        position,
                        isPlayerShip,
                        shipModel,
                        faction,
                    });
                } else {
                    assertUnreachable(this.createTemplate);
                }
            } else if (this.actionType === ActionType.panCameraOrOrder) {
                const selectedShipIds = [
                    ...new Iterator(this.selectionContainer.selectedItems)
                        .filter((so) => Spaceship.isInstance(so))
                        .map((so) => so.id),
                ];
                if (selectedShipIds.length) {
                    const position = this.parent.screenToWorld(this.dragFrom);
                    const spaceObject = this.getObjectAtPoint(this.spaceDriver.state, position);
                    if (spaceObject) {
                        this.spaceDriver.command(spaceCommands.bulkBotOrder, {
                            ids: selectedShipIds,
                            order: {
                                type: 'attack',
                                targetId: spaceObject.id,
                            },
                        });
                    } else {
                        this.spaceDriver.command(spaceCommands.bulkBotOrder, {
                            ids: selectedShipIds,
                            order: {
                                type: 'move',
                                position,
                            },
                        });
                    }
                }
            }
        }
        this.clearAction();
    };

    private clearAction() {
        const shouldCancelCreate = this.actionType === ActionType.create;
        this.stage.cursor = defaultCursor;
        this.actionType = ActionType.none;
        this.dragFrom = null;
        this.dragTo = null;
        this.createTemplate = null;
        this.drawSelection();
        if (shouldCancelCreate) {
            this.createContainer.cancel();
        }
    }

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
