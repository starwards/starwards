import { CameraView } from '../camera-view';
import { Container } from 'pixi.js';
import { SpaceObject } from '@starwards/model';

export interface SpaceObjectRenderer {
    redraw(): void;
}
export interface ObjectRendererCtor<T extends SpaceObject> {
    new (data: ObjectGraphics<T>): SpaceObjectRenderer;
}
export class ObjectGraphics<T extends SpaceObject> {
    public stage = new Container(); // stage's position is the object's position
    public isSelected = false;
    private renderer: SpaceObjectRenderer;
    constructor(
        public spaceObject: T,
        rendererCtor: ObjectRendererCtor<T>,
        public parent: CameraView,
        public blipSize: number,
        public color: number
    ) {
        this.renderer = new rendererCtor(this);
    }

    private isInStage() {
        return (
            this.stage.x + this.stage.width > 0 &&
            this.stage.y + this.stage.height > 0 &&
            this.stage.x - this.stage.width < this.parent.renderer.width &&
            this.stage.y - this.stage.height < this.parent.renderer.height
        );
    }

    redraw(isSelected: boolean) {
        if (this.spaceObject.destroyed) {
            this.destroy();
        } else {
            this.isSelected = isSelected;
            const { x, y } = this.parent.worldToScreen(this.spaceObject.position);
            this.stage.x = x;
            this.stage.y = y;
            if (this.isInStage()) {
                this.renderer.redraw();
            }
        }
    }

    destroy() {
        this.stage.destroy({
            children: true,
        });
    }
}
