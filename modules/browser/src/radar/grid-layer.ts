import { Container, DisplayObject, Graphics, TextStyle } from 'pixi.js';
import { XY, getSectorName, sectorSize } from '@starwards/core';

import { CameraView } from './camera-view';
import { TextsPool } from './texts-pool';
import { gridColors } from '../colors';

const scaleFactor = 8;
const miniSectorSize = sectorSize / (scaleFactor * 2);
export class GridLayer {
    private stage = new Container();

    private readonly gridLines = new Graphics();
    private readonly sectorNames = new TextsPool(this.stage);

    constructor(private parent: CameraView) {
        this.parent.events.on('screenChanged', () => this.drawSectorGrid());
        this.stage.addChild(this.gridLines);
        this.drawSectorGrid();
    }

    get renderRoot(): DisplayObject {
        return this.stage;
    }

    private drawSectorGrid() {
        this.gridLines.clear();
        const minMagnitude = Math.max(0, Math.floor(Math.abs(Math.log10(this.parent.camera.zoom))));
        const minGridCellSize = miniSectorSize * Math.pow(scaleFactor, minMagnitude);
        const topLeft = this.parent.screenToWorld(XY.zero);
        const bottomRight = this.parent.screenToWorld({
            x: this.parent.renderer.width,
            y: this.parent.renderer.height,
        });
        const verticals = [];
        const horizontals = [];
        const gridlineHorizTop = topLeft.y - (topLeft.y % minGridCellSize);
        for (let world = gridlineHorizTop; world <= bottomRight.y; world += minGridCellSize) {
            const distFrom0 = Math.abs(world) / miniSectorSize;
            const magnitude = this.calcGridLineMagnitude(minMagnitude, distFrom0);
            if (magnitude) {
                const screen = this.parent.worldToScreen({ x: 0, y: world }).y;
                horizontals.push({ world, screen, magnitude });
                this.gridLines.lineStyle(2, magnitude.color, 0.5);
                this.gridLines.moveTo(0, screen).lineTo(this.parent.renderer.width, screen);
            }
        }
        const gridlineVertLeft = topLeft.x - (topLeft.x % minGridCellSize);
        for (let world = gridlineVertLeft; world < bottomRight.x; world += minGridCellSize) {
            const distFrom0 = Math.abs(world) / miniSectorSize;
            const magnitude = this.calcGridLineMagnitude(minMagnitude, distFrom0);
            if (magnitude) {
                const screen = this.parent.worldToScreen({ x: world, y: 0 }).x;
                verticals.push({ world, screen, magnitude });
                this.gridLines.lineStyle(2, magnitude.color, 0.5);
                this.gridLines.moveTo(screen, 0).lineTo(screen, this.parent.renderer.height);
            }
        }
        const textsIterator = this.sectorNames[Symbol.iterator]();
        for (const horizontal of horizontals) {
            if (horizontal.magnitude.scale > 1) {
                for (const vertical of verticals) {
                    if (vertical.magnitude.scale > 1) {
                        const text = textsIterator.next().value;
                        const gridlineColor =
                            horizontal.magnitude.scale < vertical.magnitude.scale
                                ? horizontal.magnitude.color
                                : vertical.magnitude.color;
                        text.text = getSectorName(horizontal.world, vertical.world);
                        text.style.fill = gridlineColor;
                        text.x = vertical.screen;
                        text.y = horizontal.screen;
                    }
                }
            }
        }
        textsIterator.return();
    }

    private calcGridLineMagnitude(minMagnitude: number, position: number) {
        for (let i = gridColors.length - 1; i >= minMagnitude; i--) {
            if (position % Math.pow(scaleFactor, i) === 0) {
                const scale = Math.min(Math.floor(i), gridColors.length - 1);
                return { scale, color: gridColors[scale] };
            }
        }
        return null;
    }
}
