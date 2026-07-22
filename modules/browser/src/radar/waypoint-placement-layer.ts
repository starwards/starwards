import { Container, FederatedPointerEvent, Rectangle } from 'pixi.js';
import { SpaceDriver, spaceCommands } from '@starwards/core';

import { CameraView } from './camera-view';

export class WaypointPlacementLayer {
    private stage = new Container();
    private active = false;
    private badge = document.createElement('div');

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

        this.badge.dataset.id = 'placement-armed';
        this.badge.textContent = 'PLACING WAYPOINTS — W / Esc to exit';
        this.badge.style.cssText =
            'position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
            'padding:2px 12px;color:#00ffff;border:1px solid #00ffff;background:rgba(0,0,0,0.6);' +
            'font-family:Bebas,sans-serif;letter-spacing:2px;pointer-events:none;display:none;z-index:1;';
        this.parent.canvas.parentElement?.appendChild(this.badge);
        window.addEventListener('keydown', this.onKeydown);
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
        this.badge.style.display = 'block';
        this.parent.canvas.setAttribute('data-placement-active', 'true');
    }

    deactivate() {
        this.active = false;
        this.stage.interactive = false;
        this.stage.cursor = 'default';
        this.badge.style.display = 'none';
        this.parent.canvas.setAttribute('data-placement-active', 'false');
    }

    toggle() {
        if (this.active) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    private onKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.active) {
            this.deactivate();
        }
    };

    private onPointerup = (event: FederatedPointerEvent) => {
        if (!this.active) return;
        const position = this.parent.screenToWorld(event.global);
        this.spaceDriver.command(spaceCommands.createWaypointOrder, {
            position,
            owner: this.shipId,
            ...this.getSettings?.(),
        });
    };
}
