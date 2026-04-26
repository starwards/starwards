import { Container, FederatedPointerEvent, Rectangle } from 'pixi.js';
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
        this.stage.hitArea = new Rectangle(0, 0, parent.renderer.width, parent.renderer.height);
        parent.events.on('screenChanged', () => {
            this.stage.hitArea = new Rectangle(0, 0, parent.renderer.width, parent.renderer.height);
        });
        this.stage.on('pointerup', this.onPointerup);
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
