import * as PIXI from 'pixi.js';
import { Client } from 'colyseus.js';
import { SpaceState, SpaceObject, XY, getSectorName, sectorSize } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { TextsPool } from './texts-pool';
import { PontOfView } from './point-of-view';

const ENDPOINT = 'ws://localhost:8080'; // todo: use window.location

export const lerp = (a: number, b: number, t: number) => (b - a) * t + a;

type DisplayEntity = PIXI.DisplayObject & {
  [k: string]: any;
};
export class Radar extends PIXI.Application {
  private static readonly minZoom = 0.00005;
  private static readonly maxZoom = 1;
  private static readonly gridColors = [0x0000FF, 0xF4FA58, 0x00FF00, 0xFF0000];

  public interpolation: boolean = false;

  public events = new EventEmitter();

  private displayEntities: { [id: string]: DisplayEntity } = {};
  private client = new Client(ENDPOINT);
  private room = this.client.join<SpaceState>('space');
  /**
   * a point in the world that the radar is watching, and a zoom level
   */
  private pov = new PontOfView(() => this.events.emit('screenChanged'));
  private readonly gridLines = new PIXI.Graphics();
  private readonly sectorNames = new TextsPool(this.stage);

  constructor(width: number, height: number) {
    super({ width, height, backgroundColor: 0x0c0c0c });
    this.events.on('screenChanged', () => this.drawSectorGrid());
    this.room.onJoin.add(this.initialize.bind(this));
    this.stage.addChild(this.gridLines);
    this.drawSectorGrid();
    this.loop();
  }

  public loop() {
    if (this.interpolation) {
      for (const id of Object.getOwnPropertyNames(this.displayEntities)) {
        const state = this.room.state.get(id);
        if (state) {
          const graphics = this.displayEntities[id];
          const screen = this.pov.worldToScreen(this.renderer.screen,
            state.position.x,
            state.position.y
          );
          graphics.x = lerp(
            graphics.x,
            screen.x,
            0.2 // TODO use object's speed instead of constant
          );
          graphics.y = lerp(
            graphics.y,
            screen.y,
            0.2 // TODO use object's speed instead of constant
          );
        }
      }
    }
    // continue looping
    requestAnimationFrame(this.loop.bind(this));
  }

  public resizeWindow(width: number, height: number) {
    this.renderer.resize(width, height);
    this.events.emit('screenChanged');
  }

  /**
   * change radar zoom
   */
  public changeZoom(delta: number) {
    const zoom = this.pov.zoom * (1.0 + delta / 1000.0);
    this.pov.zoom = Math.max(Radar.minZoom, Math.min(Radar.maxZoom, zoom));
  }

  private drawSectorGrid() {
    this.gridLines.clear();
    const minMagnitude = Math.max(0, Math.floor(Math.abs(Math.log10(this.pov.zoom / 3.5)) - 2));
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
    for (let world = gridlineHorizTop; world <= bottomRight.y; world += minGridCellSize ) {
      const distFrom0 = Math.abs(world) / sectorSize;
      const magnitude = this.calcGridLineMagnitude(minMagnitude, distFrom0);
      if (magnitude) {
        const screen = this.pov.worldToScreen(this.renderer.screen, 0, world).y;
        horizontals.push({ world, screen, magnitude});
        this.gridLines.lineStyle(2, magnitude.color, 0.5);
        this.gridLines.moveTo(0, screen).lineTo(this.renderer.screen.width, screen);
      }
    }
    const gridlineVertLeft = topLeft.x - (topLeft.x % minGridCellSize);
    for ( let world = gridlineVertLeft; world < bottomRight.x; world += minGridCellSize) {
      const distFrom0 = Math.abs(world) / sectorSize;
      const magnitude = this.calcGridLineMagnitude(minMagnitude, distFrom0);
      if (magnitude) {
        const screen = this.pov.worldToScreen(this.renderer.screen, world, 0).x;
        verticals.push({ world, screen, magnitude});
        this.gridLines.lineStyle(2, magnitude.color, 0.5);
        this.gridLines.moveTo(screen, 0).lineTo(screen, this.renderer.screen.height);
      }
    }
    const textsIterator = this.sectorNames[Symbol.iterator]();
      // ctx.font = "24px bebas_neue_regularregular, Impact, Arial, sans-serif";
    for (const horizontal of horizontals) {
        for (const vertical of verticals) {
          const text = textsIterator.next().value;
          const gridlineColor =
            horizontal.magnitude.scale < vertical.magnitude.scale ?
            horizontal.magnitude.color :
            vertical.magnitude.color;
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
            return {scale, color : Radar.gridColors[scale]};
        }
    }
    return null;
  }

  private setGraphicsPosition(graphics: PIXI.DisplayObject, state: SpaceObject) {
    const screen = this.pov.worldToScreen(this.renderer.screen, state.position.x, state.position.y);
    graphics.x = screen.x;
    graphics.y = screen.y;
  }

  private initialize() {
    SpaceState.clientInit(this.room.state);
    this.room.state.asteroids.onAdd = (entity, key) => {
      const display = new PIXI.Container();
      this.setGraphicsPosition(display, entity);
      this.stage.addChild(display);
      this.events.on('screenChanged', () => {
        this.setGraphicsPosition(display, entity);
      });
      this.displayEntities[key] = display;
      const graphics = new PIXI.Graphics();
      display.addChild(graphics);
      graphics.clear();
      graphics.lineStyle(1, 0xffff0b);
      graphics.drawCircle(0, 0, 4);
      graphics.endFill();
      const text = new PIXI.Text(entity.id + '\nAsteroid', {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: 0xffff0b,
        align: 'center'
      });
      text.y = 10;
      text.x = -text.getLocalBounds(new PIXI.Rectangle()).width / 2;
      display.addChild(text);
      entity.onChange = changes => {
        changes.forEach(_ => {
          if (!this.interpolation) {
            this.setGraphicsPosition(display, entity);
          }
        });
      };
    };

    // assume single spaceship, this is the center of the radar
    this.room.state.spaceships.onAdd = (entity, key) => {
      const graphics = new PIXI.Graphics();
      this.pov.set(entity.position.x, entity.position.y);
      this.setGraphicsPosition(graphics, entity);
      this.events.on('screenChanged', () => {
        this.setGraphicsPosition(graphics, entity);
      });
      this.stage.addChild(graphics);
      this.displayEntities[key] = graphics;
      graphics.clear();
      graphics.lineStyle(0);
      graphics.beginFill(0xff0000, 1);
      graphics.drawRect(-5, -5, 10, 10);
      graphics.endFill();
      entity.onChange = changes => {
        changes.forEach(_ => {
          if (!this.interpolation) {
            this.setGraphicsPosition(graphics, entity);
            this.pov.set(entity.position.x, entity.position.y);
          }
        });
      };
    };

    this.room.state.registerOnRemove((_, key) => {
      const graphicEntity = this.displayEntities[key];
      delete this.displayEntities[key];
      graphicEntity.parent.removeChild(graphicEntity);
      graphicEntity.destroy();
    });
  }
}
