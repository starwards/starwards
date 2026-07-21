import { Container, FederatedPointerEvent, Rectangle } from 'pixi.js';
import { SpaceDriver, spaceCommands } from '@starwards/core';

import { CameraView } from './camera-view';

export class WaypointPlacementLayer {
    private stage = new Container();
    private active = false;

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
        private shipId?: string,
        private getSettings?: () => { collection: string; color: number },
    ) {
        // only intercept pointer events while placement mode is on, so layers below
        // (e.g. waypoint selection) get the clicks otherwise
        this.stage.interactive = false;
        this.stage.hitArea = this.rectHitArea();
        parent.events.on('screenChanged', () => {
            this.stage.hitArea = this.rectHitArea();
        });
        this.stage.on('pointerup', this.onPointerup);
    }

    private rectHitArea() {
        return new Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
    }

    get renderRoot(): Container {
        return this.stage;
    }

    activate() {
        this.active = true;
        this.stage.interactive = true;
        this.stage.cursor = 'cell';
    }

    deactivate() {
        this.active = false;
        this.stage.interactive = false;
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
        this.spaceDriver.command(spaceCommands.createWaypointOrder, {
            position,
            owner: this.shipId,
            ...this.getSettings?.(),
        });
        this.deactivate();
    };
}
