import * as PIXI from 'pixi.js';
import { XY } from '@starwards/model';

export interface Screen {
  width: number;
  height: number;
}
export class PontOfView extends PIXI.ObservablePoint {
    /**
     * the pixel / meter ratio
     */
  public get zoom() {
    return this._zoom;
  }
  public set zoom(value: number) {
    if (this._zoom !== value && !Number.isNaN(value)) {
      this._zoom = value;
      this.cb();
    }
  }
  private _zoom = 1;

  constructor(protected cb: () => void) {
    super(cb, null);
  }

  public worldToScreen(screen: Screen, x: number, y: number): XY {
    return {
      x: (x - this.x) * this.zoom + screen.width / 2,
      y: (y - this.y) * this.zoom + screen.height / 2
    };
  }

  public screenToWorld(screen: Screen, x: number, y: number): XY {
    return {
      x: this.x + (x - screen.width / 2) / this.zoom,
      y: this.y + (y - screen.height / 2) / this.zoom
    };
  }
}
