import { Container, FederatedPointerEvent, Graphics, Rectangle } from 'pixi.js';
import { SpaceObject, Waypoint, XY, spaceCommands } from '@starwards/core';

import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';
import { SpaceDriver } from '@starwards/core';
import hotkeys from 'hotkeys-js';
import { selectionColor } from '../colors';

enum ActionType {
    none,
    select,
    dragWaypoints,
    panCamera,
}

/**
 * Click / drag-rectangle selection and drag-to-move of the ship's own waypoints (a limited
 * form of the GM InteractiveLayer: no orders, no other objects).
 * ctrl adds to the selection, alt subtracts. Dragging from a waypoint moves the selection.
 * Right-button drag pans the camera.
 */
export class WaypointSelectionLayer {
    private static readonly selectPointGrace = 32;

    private stage = new Container();
    private actionType = ActionType.none;
    private dragFrom: XY | null = null;
    private dragTo: XY | null = null;
    private selectionGraphics = new Graphics();

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
        private selectionContainer: SelectionContainer,
        private shipId: string,
        private enabled: () => boolean = () => true,
        private onPan: () => void = () => undefined,
    ) {
        this.stage.interactive = true;
        this.stage.hitArea = this.rectHitArea();
        this.parent.events.on('screenChanged', () => {
            this.stage.hitArea = this.rectHitArea();
        });
        this.stage.addChild(this.selectionGraphics);
        this.stage.on('pointerdown', this.onPointerDown);
        this.stage.on('pointermove', this.onPointerMove);
        this.stage.on('pointerup', this.onPointerUp);
        this.stage.on('pointerupoutside', this.onPointerUp);
    }

    private rectHitArea() {
        return new Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
    }

    get renderRoot(): Container {
        return this.stage;
    }

    private ownWaypoints(): Waypoint[] {
        return [...this.spaceDriver.state.getAll('Waypoint')].filter((wp) => wp.owner === this.shipId && !wp.destroyed);
    }

    private waypointAtScreenPoint(screenPoint: XY): Waypoint | undefined {
        const point = this.parent.screenToWorld(screenPoint);
        const grace = WaypointSelectionLayer.selectPointGrace / this.parent.camera.zoom;
        return this.ownWaypoints().find((wp) =>
            XY.inRange(wp.position, XY.add(point, { x: -grace, y: -grace }), XY.add(point, { x: grace, y: grace })),
        );
    }

    private applySelection(selected: SpaceObject[]) {
        if (hotkeys.ctrl) {
            this.selectionContainer.add(selected);
        } else if (hotkeys.alt) {
            this.selectionContainer.remove(selected);
        } else {
            this.selectionContainer.set(selected);
        }
    }

    private onPointerDown = (event: FederatedPointerEvent) => {
        if (!this.enabled()) return;
        if (event.button === 2) {
            this.dragFrom = XY.clone(event.global);
            this.dragTo = null;
            this.actionType = ActionType.panCamera;
            this.stage.cursor = 'grab';
            return;
        }
        if (event.button !== 0) return;
        this.dragFrom = XY.clone(event.global);
        this.dragTo = null;
        const hit = hotkeys.ctrl || hotkeys.alt ? undefined : this.waypointAtScreenPoint(this.dragFrom);
        if (hit) {
            // dragging from a waypoint moves the selection (selecting it first if needed)
            if (!this.selectionContainer.selectedItemsIds.includes(hit.id)) {
                this.selectionContainer.set([hit]);
            }
            this.actionType = ActionType.dragWaypoints;
        } else {
            this.actionType = ActionType.select;
        }
    };

    private onPointerMove = (event: FederatedPointerEvent) => {
        if (!this.dragFrom) return;
        if (this.actionType === ActionType.dragWaypoints) {
            const dragTo = XY.clone(event.global);
            const screenMove = XY.difference(dragTo, this.dragFrom);
            const worldMove = XY.scale(screenMove, 1 / this.parent.camera.zoom);
            this.spaceDriver.command(spaceCommands.bulkMove, {
                ids: this.selectionContainer.selectedItemsIds,
                delta: worldMove,
            });
            // set next drag origin to current mouse position
            this.dragFrom = dragTo;
        } else if (this.actionType === ActionType.panCamera) {
            this.onPan();
            const dragTo = XY.clone(event.global);
            const screenMove = XY.difference(this.dragFrom, dragTo); // camera moves opposite to the drag direction
            const worldMove = XY.scale(screenMove, 1 / this.parent.camera.zoom);
            this.parent.camera.set(XY.add(this.parent.camera, worldMove));
            // set next drag origin to current mouse position
            this.dragFrom = dragTo;
        } else if (this.actionType === ActionType.select) {
            this.dragTo = XY.clone(event.global);
            this.drawSelectionRect();
        }
    };

    private onPointerUp = () => {
        if (!this.dragFrom) return;
        if (this.actionType === ActionType.select) {
            const from = this.parent.screenToWorld(this.dragFrom);
            if (this.dragTo == null) {
                const hit = this.waypointAtScreenPoint(this.dragFrom);
                this.applySelection(hit ? [hit] : []);
            } else {
                const to = this.parent.screenToWorld(this.dragTo);
                const min = XY.min(from, to);
                const max = XY.max(from, to);
                this.applySelection(this.ownWaypoints().filter((wp) => XY.inRange(wp.position, min, max)));
            }
        }
        this.actionType = ActionType.none;
        this.dragFrom = null;
        this.dragTo = null;
        this.stage.cursor = 'default';
        this.selectionGraphics.clear();
    };

    private drawSelectionRect() {
        this.selectionGraphics.clear();
        if (this.dragFrom && this.dragTo) {
            const min = XY.min(this.dragFrom, this.dragTo);
            const max = XY.max(this.dragFrom, this.dragTo);
            this.selectionGraphics
                .rect(min.x, min.y, max.x - min.x, max.y - min.y)
                .stroke({ width: 1, color: selectionColor });
        }
    }
}
