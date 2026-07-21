import { Container, FederatedPointerEvent, Graphics, Rectangle } from 'pixi.js';
import { SpaceObject, Waypoint, XY } from '@starwards/core';

import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';
import { SpaceDriver } from '@starwards/core';
import hotkeys from 'hotkeys-js';
import { selectionColor } from '../colors';

/**
 * Click / drag-rectangle selection of the ship's own waypoints (a limited form of the GM
 * InteractiveLayer: selection only — no orders, no dragging objects).
 * ctrl adds to the selection, alt subtracts.
 */
export class WaypointSelectionLayer {
    private static readonly selectPointGrace = 32;

    private stage = new Container();
    private dragFrom: XY | null = null;
    private dragTo: XY | null = null;
    private selectionGraphics = new Graphics();

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
        private selectionContainer: SelectionContainer,
        private shipId: string,
        private enabled: () => boolean = () => true,
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
        if (!this.enabled() || event.button !== 0) return;
        this.dragFrom = XY.clone(event.global);
        this.dragTo = null;
    };

    private onPointerMove = (event: FederatedPointerEvent) => {
        if (!this.dragFrom) return;
        this.dragTo = XY.clone(event.global);
        this.drawSelectionRect();
    };

    private onPointerUp = () => {
        if (!this.dragFrom) return;
        const from = this.parent.screenToWorld(this.dragFrom);
        if (this.dragTo == null) {
            const grace = WaypointSelectionLayer.selectPointGrace / this.parent.camera.zoom;
            const hit = this.ownWaypoints().find((wp) =>
                XY.inRange(wp.position, XY.add(from, { x: -grace, y: -grace }), XY.add(from, { x: grace, y: grace })),
            );
            this.applySelection(hit ? [hit] : []);
        } else {
            const to = this.parent.screenToWorld(this.dragTo);
            const min = XY.min(from, to);
            const max = XY.max(from, to);
            this.applySelection(this.ownWaypoints().filter((wp) => XY.inRange(wp.position, min, max)));
        }
        this.dragFrom = null;
        this.dragTo = null;
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
