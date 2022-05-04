import { CameraView } from '../camera-view';
import { Container } from 'pixi.js';
import { SpaceObject } from '@starwards/model';

export interface SpaceObjectRenderer {
    redraw(): void;
}
export interface ObjectRendererCtor<T extends SpaceObject> {
    new (data: ObjectGraphics<T>): SpaceObjectRenderer;
}
export class ObjectGraphics<T extends SpaceObject = SpaceObject> {
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

    public update() {
        const { x, y } = this.parent.worldToScreen(this.spaceObject.position);
        this.stage.x = x;
        this.stage.y = y;
    }

    public shouldRedraw() {
        return (
            this.stage.x + this.stage.width > 0 &&
            this.stage.y + this.stage.height > 0 &&
            this.stage.x - this.stage.width < this.parent.renderer.width &&
            this.stage.y - this.stage.height < this.parent.renderer.height
        );
    }

    draw(isSelected: boolean) {
        this.isSelected = isSelected;
        this.renderer.redraw();
    }

    destroy() {
        this.stage.destroy({
            children: true,
        });
    }
}
