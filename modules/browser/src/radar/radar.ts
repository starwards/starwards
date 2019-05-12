import * as PIXI from 'pixi.js';
import { Room } from 'colyseus.js';
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
import { draw } from './draw-entity';
import { DataChange } from '@colyseus/schema';

export const lerp = (a: number, b: number, t: number) => (b - a) * t + a;

type DisplayEntity = PIXI.DisplayObject & {
  [k: string]: any;
};
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

  private displayEntities: { [id: string]: DisplayEntity } = {};
  // private room = this.client.join<SpaceState>('space');
  private readonly gridLines = new PIXI.Graphics();
  private readonly sectorNames = new TextsPool(this.stage);

  constructor(width: number, height: number, private room: Room<SpaceState>) {
    super({ width, height, backgroundColor: 0x0f0f0f });
    this.events.on('screenChanged', () => this.drawSectorGrid());
    if (this.room.hasJoined) {
      this.initialize();
    } else {
      this.room.onJoin.add(this.initialize.bind(this));
    }
    this.stage.addChild(this.gridLines);
    this.stage.addChild(this.fpsCounter);

    this.drawSectorGrid();
    // this.loop();
  }

  // private loop() {
  //   if (this.interpolation) {
  //     for (const id of Object.getOwnPropertyNames(this.displayEntities)) {
  //       const state = this.room.state.get(id);
  //       if (state) {
  //         const graphics = this.displayEntities[id];
  //         const screen = this.pov.worldToScreen(this.renderer.screen,
  //           state.position.x,
  //           state.position.y
  //         );
  //         graphics.x = lerp(
  //           graphics.x,
  //           screen.x,
  //           0.2 // TODO use object's speed instead of constant
  //         );
  //         graphics.y = lerp(
  //           graphics.y,
  //           screen.y,
  //           0.2 // TODO use object's speed instead of constant
  //         );
  //       }
  //     }
  //   }
  //   // continue looping
  //   requestAnimationFrame(this.loop.bind(this));
  // }

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
    this.room.state.events.on('add', (entity: SpaceObject) => this.onNewEntity(entity));
    this.room.state.events.on('remove', (entity: SpaceObject) => this.onRemoveEntity(entity.id));

    for (const entity of this.room.state) {
      this.onNewEntity(entity);
    }
  }

  private setGraphicsPosition(
    graphics: PIXI.DisplayObject,
    state: SpaceObject
  ) {
    const screen = this.pov.worldToScreen(
      this.renderer.screen,
      state.position.x,
      state.position.y
    );
    graphics.x = screen.x;
    graphics.y = screen.y;
  }

  private onNewEntity(entity: SpaceObjects[keyof SpaceObjects]) {
    const type = entity.type;
    const follow = Spaceship.isInstance(entity);
    if (follow) {
      this.pov.set(entity.position.x, entity.position.y);
    }
    const root = new PIXI.Container();
    this.setGraphicsPosition(root, entity);
    this.displayEntities[entity.id] = root;
    this.events.on('screenChanged', () => {
      this.setGraphicsPosition(root, entity);
    });
    this.stage.addChild(root);

    let drawProps = draw(type)(entity, root);

    this.room.state.events.on(entity.id, (changes: DataChange[]) => {
      changes.forEach(change => {
        if (change.field === 'position') {
          this.setGraphicsPosition(root, entity);
          if (follow) {
            this.pov.set(entity.position.x, entity.position.y);
          }
        } else if (drawProps.indexOf(change.field) !== -1) {
          root.removeChildren();
          drawProps = draw(type)(entity, root);
        }
      });
    });
  }

  private onRemoveEntity(id: string) {
    const graphicEntity = this.displayEntities[id];
    delete this.displayEntities[id];
    graphicEntity.parent.removeChild(graphicEntity);
    graphicEntity.destroy();
  }

}
