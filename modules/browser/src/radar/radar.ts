import * as PIXI from 'pixi.js';
import {
  SpaceState,
  getSectorName,
  sectorSize,
  SpaceObjects,
  Spaceship,
  SpaceObject
} from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { TextsPool } from './texts-pool';
import { PontOfView } from './point-of-view';
import { PixiFps } from './pixi-fps';
import { blipRenderer } from './blip-renderer';
import { DataChange } from '@colyseus/schema';
import { GameRoom } from '../client';

export const lerp = (a: number, b: number, t: number) => (b - a) * t + a;

type Blip = PIXI.DisplayObject & {
  [k: string]: any;
};

// sources of inspiration for future product improvements:
// https://www.marineinsight.com/marine-navigation/using-radar-on-ships-15-important-points/
// https://en.wikipedia.org/wiki/Radar_display
export class Radar extends PIXI.Application {
  private static readonly minZoom = 0.00005;
  private static readonly maxZoom = 1;
  private static readonly gridColors = [0x6666ff, 0xf4fa77, 0x55ff55, 0xff3333];

  // public interpolation: boolean = false;

  public events = new EventEmitter();
  /**
   * a point in the world that the radar is watching, and a zoom level
   */
  public pov = new PontOfView(() => this.events.emit('screenChanged'));
  private fpsCounter = new PixiFps();

  private blips: { [id: string]: Blip } = {};
  // private room = this.client.join<SpaceState>('space');
  private readonly gridLines = new PIXI.Graphics();
  private readonly sectorNames = new TextsPool(this.stage);

  constructor(
    width: number,
    height: number,
    private room: GameRoom<SpaceState, any>
  ) {
    super({ width, height, backgroundColor: 0x0f0f0f });
    this.events.on('screenChanged', () => this.drawSectorGrid());
    this.room.ready.then(this.initialize.bind(this));
    this.stage.addChild(this.gridLines);
    this.stage.addChild(this.fpsCounter);
    this.drawSectorGrid();
    // this.loop();
  }

  public resizeWindow(width: number, height: number) {
    this.renderer.resize(width, height);
    this.events.emit('screenChanged');
  }

  public setZoom(zoom: number) {
    zoom = Math.max(Radar.minZoom, Math.min(Radar.maxZoom, zoom));
    if (this.pov.zoom !== zoom) {
      this.pov.zoom = zoom;
      this.events.emit('zoomChanged');
    }
  }
  /**
   * change radar zoom
   */
  public changeZoom(delta: number) {
    this.setZoom(this.pov.zoom * (1.0 + delta / 1000.0));
  }

  private drawSectorGrid() {
    this.gridLines.clear();
    const minMagnitude = Math.max(
      0,
      Math.floor(Math.abs(Math.log10(this.pov.zoom / 2.5)) - 2)
    );
    const minGridCellSize = sectorSize * Math.pow(8, minMagnitude);
    const topLeft = this.pov.screenToWorld(this.renderer.screen, 0, 0);
    const bottomRight = this.pov.screenToWorld(
      this.renderer.screen,
      this.renderer.screen.width,
      this.renderer.screen.height
    );
    const verticals = [];
    const horizontals = [];
    const gridlineHorizTop = topLeft.y - (topLeft.y % minGridCellSize);
    for (
      let world = gridlineHorizTop;
      world <= bottomRight.y;
      world += minGridCellSize
    ) {
      const distFrom0 = Math.abs(world) / sectorSize;
      const magnitude = this.calcGridLineMagnitude(minMagnitude, distFrom0);
      if (magnitude) {
        const screen = this.pov.worldToScreen(this.renderer.screen, 0, world).y;
        horizontals.push({ world, screen, magnitude });
        this.gridLines.lineStyle(2, magnitude.color, 0.5);
        this.gridLines
          .moveTo(0, screen)
          .lineTo(this.renderer.screen.width, screen);
      }
    }
    const gridlineVertLeft = topLeft.x - (topLeft.x % minGridCellSize);
    for (
      let world = gridlineVertLeft;
      world < bottomRight.x;
      world += minGridCellSize
    ) {
      const distFrom0 = Math.abs(world) / sectorSize;
      const magnitude = this.calcGridLineMagnitude(minMagnitude, distFrom0);
      if (magnitude) {
        const screen = this.pov.worldToScreen(this.renderer.screen, world, 0).x;
        verticals.push({ world, screen, magnitude });
        this.gridLines.lineStyle(2, magnitude.color, 0.5);
        this.gridLines
          .moveTo(screen, 0)
          .lineTo(screen, this.renderer.screen.height);
      }
    }
    const textsIterator = this.sectorNames[Symbol.iterator]();
    for (const horizontal of horizontals) {
      for (const vertical of verticals) {
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
    textsIterator.return();
  }

  private calcGridLineMagnitude(minMagnitude: number, position: number) {
    for (let i = Radar.gridColors.length - 1; i >= minMagnitude; i--) {
      if (position % Math.pow(8, i) === 0) {
        const scale = Math.min(Math.floor(i), Radar.gridColors.length - 1);
        return { scale, color: Radar.gridColors[scale] };
      }
    }
    return null;
  }

  private initialize() {
    // assume single spaceship, this is the center of the radar
    this.room.state.events.on('add', (spaceObject: SpaceObject) =>
      this.onNewSpaceObject(spaceObject)
    );
    this.room.state.events.on('remove', (spaceObject: SpaceObject) =>
      this.onRemoveSpaceObject(spaceObject.id)
    );

    for (const spaceObject of this.room.state) {
      this.onNewSpaceObject(spaceObject);
    }
  }

  private setBlipPosition(
    blip: PIXI.DisplayObject,
    state: SpaceObject
  ) {
    const screen = this.pov.worldToScreen(
      this.renderer.screen,
      state.position.x,
      state.position.y
    );
    blip.x = screen.x;
    blip.y = screen.y;
  }

  private onNewSpaceObject(spaceObject: SpaceObjects[keyof SpaceObjects]) {
    const follow = Spaceship.isInstance(spaceObject);
    const blip = new PIXI.Container();
    this.setBlipPosition(blip, spaceObject);
    this.blips[spaceObject.id] = blip;
    this.events.on('screenChanged', () =>
      this.setBlipPosition(blip, spaceObject)
    );
    this.stage.addChild(blip);

    let drawProps = blipRenderer(spaceObject, blip);

    this.room.state.events.on(spaceObject.id, (changes: DataChange[]) => {
      let redrawNeeded = false;
      changes.forEach(change => {
        if (change.field === 'position') {
          this.setBlipPosition(blip, spaceObject);
          if (follow) {
            this.pov.set(spaceObject.position.x, spaceObject.position.y);
          }
        }
        redrawNeeded = redrawNeeded || drawProps.has(change.field);
      });

      if (redrawNeeded) {
        // re-draw blip
        blip.removeChildren();
        drawProps = blipRenderer(spaceObject, blip);
      }
    });

    if (follow) {
      this.pov.set(spaceObject.position.x, spaceObject.position.y);
    }
  }

  private onRemoveSpaceObject(id: string) {
    const blip = this.blips[id];
    delete this.blips[id];
    blip.parent.removeChild(blip);
    blip.destroy();
  }
}
