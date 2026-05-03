import { Circle, Container, FederatedPointerEvent } from 'pixi.js';
import { SpaceDriver, spaceCommands } from '@starwards/core';

import { CameraView } from './camera-view';

export class WaypointPlacementLayer {
    private stage = new Container();
    private active = false;

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
    ) {
        this.stage.interactive = true;
        this.stage.hitArea = this.circleHitArea();
        parent.events.on('screenChanged', () => {
            this.stage.hitArea = this.circleHitArea();
        });
        this.stage.on('pointerup', this.onPointerup);
    }

    private circleHitArea() {
        return new Circle(this.parent.renderer.width / 2, this.parent.renderer.height / 2, this.parent.radius);
    }

    get renderRoot(): Container {
        return this.stage;
    }

    activate() {
        this.active = true;
        this.stage.cursor = 'cell';
    }

    deactivate() {
        this.active = false;
        this.stage.cursor = 'default';
    }

    toggle() {
        if (this.active) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    private onPointerup = (event: FederatedPointerEvent) => {
        if (!this.active) return;
        const position = this.parent.screenToWorld(event.global);
        this.spaceDriver.command(spaceCommands.createWaypointOrder, { position });
        this.deactivate();
    };
}
