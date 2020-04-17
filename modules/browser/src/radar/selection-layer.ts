import { XY } from '@starwards/model';
import * as PIXI from 'pixi.js';
import { BaseContainer } from './base-container';

// https://pixijs.io/examples/?v=v5.2.1#/interaction/dragging.js
export class SelectionLayer {
    private static readonly SelectionColor = 0x26dafd;

    private dragFrom: XY | null = null;
    private dragTo: XY | null = null;
    private texture = PIXI.Texture.from('images/RadarBlip.png');
    private selected = [] as XY[];
    private stage: PIXI.Container;

    constructor(private parent: BaseContainer) {
        this.stage = parent.addLayer();
        this.stage.interactive = true;
        this.stage.hitArea = new PIXI.Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
        this.parent.events.on('screenChanged', () => {
            this.stage.hitArea = new PIXI.Rectangle(0, 0, this.parent.renderer.width, this.parent.renderer.height);
            this.drawSelection();
        });
        this.parent.renderer.plugins.interaction.on('pointerdown', this.onPointerDown);
        this.parent.renderer.plugins.interaction.on('pointermove', this.onPointermove);
        this.parent.renderer.plugins.interaction.on('pointerup', this.onPointerup);
    }

    onPointermove = (event: PIXI.interaction.InteractionEvent) => {
        if (this.dragFrom) {
            this.dragTo = event.data.getLocalPosition(this.stage);
            this.drawSelection();
        }
    };

    onPointerDown = (event: PIXI.interaction.InteractionEvent) => {
        const position = event.data.getLocalPosition(this.stage);
        this.dragFrom = this.parent.pov.screenToWorld(this.parent.renderer.screen, position.x, position.y);
        this.selected.push(this.dragFrom);
        this.drawSelection();
    };

    onPointerup = (_event: PIXI.interaction.InteractionEvent) => {
        // TODO select
        if (this.dragTo == null) {
            console.log('click!!');
        } else {
            console.log('drag!!');
        }
        this.dragFrom = null;
        this.dragTo = null;
        this.drawSelection();
    };

    private drawSelection() {
        this.stage.removeChildren();

        for (const i of this.selected) {
            const pos = this.parent.pov.worldToScreen(this.parent.renderer.screen, i.x, i.y);
            const marker = new PIXI.Sprite(this.texture);
            marker.x = pos.x - this.texture.width / 2;
            marker.y = pos.y - this.texture.height / 2;
            this.stage.addChild(marker);
        }

        if (this.dragFrom && this.dragTo) {
            const begin = this.parent.pov.worldToScreen(this.parent.renderer.screen, this.dragFrom.x, this.dragFrom.y);
            const graphics = this.drawSelectionArea(begin, this.dragTo);
            this.stage.addChild(graphics);
        }
    }

    private drawSelectionArea(from: XY, to: XY) {
        const min = XY.min(from, to);
        const absDifference = XY.absDifference(from, to);
        const graphics = new PIXI.Graphics();
        graphics.lineStyle(1, SelectionLayer.SelectionColor, 1);
        graphics.beginFill(SelectionLayer.SelectionColor, 0.2);
        graphics.drawRect(min.x, min.y, absDifference.x, absDifference.y);
        graphics.endFill();
        return graphics;
    }
}
