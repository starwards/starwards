import { BlipData, BlipRenderer } from './blip-renderer';
import { Container, UPDATE_PRIORITY } from 'pixi.js';
import { SpaceDriver, SpaceObject, SpaceObjects, XY } from '@starwards/core';

import { CameraView } from '../camera-view';
import { TrackObjects } from '../track-objects';
import { white } from '../../colors';

type RenderFunctions<K extends keyof SpaceObjects> = {
    [T in K]: {
        new (stage: Container, blipSize: number): BlipRenderer<SpaceObjects[T]>;
    };
};
type Selection = { has(o: SpaceObject): boolean };
type Filter<K extends keyof SpaceObjects> = (o: SpaceObjects[K]) => boolean;
type Positioning<K extends keyof SpaceObjects> = (o: SpaceObjects[K]) => XY;

type Blip<K extends keyof SpaceObjects> = readonly [BlipRenderer<SpaceObjects[K]>, BlipData];
export class ObjectsLayer<K extends keyof SpaceObjects = keyof SpaceObjects> {
    private stage = new Container();

    private createBlip = (spaceObject: SpaceObjects[K]): Blip<K> => {
        const stage = new Container();
        const renderer = new this.drawFunctions[spaceObject.type as K](stage, this.blipSize);
        const data = {
            isSelected: false,
            color: white,
            stage,
            parent: this.parent,
            blipSize: this.blipSize,
            alpha: 1,
        };
        this.updateBlip(spaceObject, [renderer, data]);
        this.stage.addChild(data.stage);
        return [renderer, data];
    };

    private updateBlip = (o: SpaceObjects[K], [r, g]: Blip<K>) => {
        const { x, y } = this.position(o);
        g.stage.x = x;
        g.stage.y = y;
        const shouldRedraw =
            g.stage.x + g.stage.width > 0 &&
            g.stage.y + g.stage.height > 0 &&
            g.stage.x - g.stage.width < this.parent.renderer.width &&
            g.stage.y - g.stage.height < this.parent.renderer.height;
        if (shouldRedraw) {
            g.isSelected = Boolean(this.selectedItems?.has(o));
            g.color = this.getColor(o);
            g.alpha = this.getAlpha(o);
            r.redraw(o, g);
        }
    };

    private destroyBlip = ([_, g]: Blip<K>) => {
        g.stage.destroy({ children: true });
        this.stage.removeChild(g.stage);
    };
    private shouldTrack = (o: SpaceObject): o is SpaceObjects[K] =>
        !o.destroyed && !!this.drawFunctions[o.type as K] && (!this.filter || this.filter(o as SpaceObjects[K]));

    private blips = new TrackObjects<Blip<K>, SpaceObjects[K]>(
        this.spaceDriver,
        this.createBlip,
        this.updateBlip,
        this.destroyBlip,
        this.shouldTrack
    );

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
        private blipSize: number,
        private getColor: (s: SpaceObjects[K]) => number,
        private drawFunctions: RenderFunctions<K>,
        private readonly selectedItems?: Selection,
        private readonly filter?: Filter<K>,
        private readonly position: Positioning<K> = (o: SpaceObjects[K]) => this.parent.worldToScreen(o.position),
        private readonly getAlpha: (s: SpaceObjects[K]) => number = () => 1
    ) {
        parent.ticker.add(this.blips.update, UPDATE_PRIORITY.LOW);
    }

    get renderRoot(): Container {
        return this.stage;
    }
}
