import * as PIXI from 'pixi.js';
import Viewport from 'pixi-viewport';
import { Client } from 'colyseus.js';
import { State, Entity } from '@starwards/colyseus-server';
import { MapSchema } from '@colyseus/schema';

const ENDPOINT =
  process.env.NODE_ENV === 'development'
    ? 'ws://localhost:8080'
    : 'wss://colyseus-pixijs-boilerplate.herokuapp.com';

const WORLD_SIZE = 2000;

export const lerp = (a: number, b: number, t: number) => (b - a) * t + a;

type GraphicEntity = PIXI.Graphics & {
  [k: string]: any;
};

export class Application extends PIXI.Application {

  public entities: { [id: string]: GraphicEntity } = {};
  public currentPlayerEntity: GraphicEntity | null = null;

  public client = new Client(ENDPOINT);
  public room = this.client.join<State>('arena');

  public viewport: Viewport;

  public _axisListener: any;
  public _interpolation: boolean = false;

  constructor() {
    super({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0c0c0c
    });

    this.viewport = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: WORLD_SIZE,
      worldHeight: WORLD_SIZE
    });

    // draw boundaries of the world
    const boundaries = new PIXI.Graphics();
    boundaries.beginFill(0x000000);
    boundaries.drawRoundedRect(0, 0, WORLD_SIZE, WORLD_SIZE, 30);
    this.viewport.addChild(boundaries);

    // add viewport to stage
    this.stage.addChild(this.viewport);
    this.interpolation = false;

    this.room.onJoin.add(this.initialize.bind(this));

    this.viewport.on('mousemove', e => {
      if (this.currentPlayerEntity) {
        const point = this.viewport.toLocal(e.data.global);
        this.room.send(['mouse', { x: point.x, y: point.y }]);
      }
    });
  }

  set interpolation(bool: boolean) {
    this._interpolation = bool;

    if (this._interpolation) {
    //   this.room.removeListener(this._axisListener);
      this.loop();
    } else {
    //   // update entities position directly when they arrive
    //   this._axisListener = this.room.listen(
    //     'entities/:id/:axis',
    //     (change: DataChange) => {
    //       this.entities[change.path.id][change.path.axis] = change.value;
    //     },
    //     true
    //   );
    }
  }

  public loop() {
    for (const id of Object.getOwnPropertyNames(this.entities)) {
      this.entities[id].x = lerp(
        this.entities[id].x,
        this.room.state.entities[id].x,
        0.2
      );
      this.entities[id].y = lerp(
        this.entities[id].y,
        this.room.state.entities[id].y,
        0.2
      );
    }

    // continue looping if interpolation is still enabled.
    if (this._interpolation) {
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  private initialize() {
    this.room.state.entities.onAdd = (entity, key) => {
        const color = entity.radius < 4 ? 0xff0000 : 0xffff0b;

        const graphics = new PIXI.Graphics();
        graphics.lineStyle(0);
        graphics.beginFill(color, 0.5);
        graphics.drawCircle(0, 0, entity.radius);
        graphics.endFill();

        graphics.x = entity.x;
        graphics.y = entity.y;
        this.viewport.addChild(graphics);

        this.entities[key] = graphics;

        // detecting current user
        if (key === this.room.sessionId) {
          this.currentPlayerEntity = graphics;
          this.viewport.follow(this.currentPlayerEntity);
        }
        entity.onChange = changes => {
          changes.forEach(change => {
              if (change.field === 'radius') {
                const newColor = entity.radius < 4 ? 0xff0000 : 0xffff0b;

                graphics.clear();
                graphics.lineStyle(0);
                graphics.beginFill(newColor, 0.5);
                graphics.drawCircle(0, 0, entity.radius);
                graphics.endFill();

                // if (this.currentPlayerEntity) {
                //     // console.log(this.currentPlayerEntity.width);
                //     // console.log(this.currentPlayerEntity.width / 20);
                //     this.viewport.scale.x = lerp(this.viewport.scale.x, this.currentPlayerEntity.width / 20, 0.2)
                //     this.viewport.scale.y = lerp(this.viewport.scale.y, this.currentPlayerEntity.width / 20, 0.2)
                // }
              } else if (!this._interpolation) {
                graphics.x = entity.x;
                graphics.y = entity.y;
              }
          });
        };
      };

    this.room.state.entities.onRemove = (_, key) => {
          this.viewport.removeChild(this.entities[key]);
          this.entities[key].destroy();
          delete this.entities[key];
      };
  }
}
