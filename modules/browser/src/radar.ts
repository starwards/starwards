import * as PIXI from 'pixi.js';
import Viewport from 'pixi-viewport';
import { Client } from 'colyseus.js';
import { SpaceState, SpaceObject } from '@starwards/model';

const ENDPOINT = 'ws://localhost:8080'; // todo: use window.location

export const lerp = (a: number, b: number, t: number) => (b - a) * t + a;

type GraphicEntity = PIXI.Graphics & {
  [k: string]: any;
};

export class Radar extends PIXI.Application {
  public entities: { [id: string]: GraphicEntity } = {};

  public client = new Client(ENDPOINT);
  public room = this.client.join<SpaceState>('space');

  public viewport: Viewport;
  public viewCenter: PIXI.Point;

  public _axisListener: any;
  public interpolation: boolean = false;

  constructor() {
    super({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0c0c0c
    });
    this.viewCenter = new PIXI.Point();

    this.viewport = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight
    }).wheel({center: this.viewCenter});

    // draw boundaries of the world
    // const boundaries = new PIXI.Graphics();
    // boundaries.beginFill(0x000000);
    // boundaries.drawRoundedRect(0, 0, WORLD_SIZE, WORLD_SIZE, 30);
    // this.viewport.addChild(boundaries);

    // add viewport to stage
    this.stage.addChild(this.viewport);
    this.room.onJoin.add(this.initialize.bind(this));

    // this.viewport.on('mousemove', e => {
    //   if (this.currentPlayerEntity) {
    //     const point = this.viewport.toLocal(e.data.global);
    //     this.room.send(['mouse', { x: point.x, y: point.y }]);
    //   }
    // });
    this.loop();
  }

  public loop() {
    if (this.interpolation) {
      for (const id of Object.getOwnPropertyNames(this.entities)) {
        const state = this.room.state.get(id);
        if (state) {
          this.entities[id].x = lerp(
            this.entities[id].x,
            state.position.x,
            0.2 // TODO use object's speed instead of constant
          );
          this.entities[id].y = lerp(
            this.entities[id].y,
            state.position.y,
            0.2 // TODO use object's speed instead of constant
          );
        }
      }
    }
    // continue looping
    requestAnimationFrame(this.loop.bind(this));
  }

  // TODO extract to static
  private setPosition(graphics: PIXI.Graphics, entity: SpaceObject) {
    graphics.x = entity.position.x;
    graphics.y = entity.position.y;
  }

  private setViewCenter(graphics: PIXI.Graphics) {
    this.viewCenter.x = graphics.x;
    this.viewCenter.y = graphics.y;
    this.viewport.moveCenter(this.viewCenter);
  }

  private initialize() {
    SpaceState.clientInit(this.room.state);
    this.room.state.asteroids.onAdd = (entity, key) => {
      const graphics = new PIXI.Graphics();
      this.setPosition(graphics, entity);
      this.viewport.addChild(graphics);
      this.entities[key] = graphics;
      graphics.clear();
      graphics.lineStyle(0);
      graphics.beginFill(0xffff0b, 0.5);
      graphics.drawCircle(0, 0, 10);
      graphics.endFill();
      entity.onChange = changes => {
        changes.forEach(_ => {
          if (!this.interpolation) {
            this.setPosition(graphics, entity);
          }
        });
      };
    };

    // assume single spaceship
    this.room.state.spaceships.onAdd = (entity, key) => {
      const graphics = new PIXI.Graphics();
      this.setPosition(graphics, entity);
      this.viewport.addChild(graphics);
      this.entities[key] = graphics;
      graphics.clear();
      graphics.lineStyle(0);
      graphics.beginFill(0xff0000, 1);
      graphics.drawRect(-5, -5, 10, 10);
      graphics.endFill();
      entity.onChange = changes => {
        changes.forEach(_ => {
          if (!this.interpolation) {
            this.setPosition(graphics, entity);
            this.setViewCenter(graphics);
          }
        });
      };
      this.setViewCenter(graphics);
    };

    this.room.state.registerOnRemove((_, key) => {
      this.viewport.removeChild(this.entities[key]);
      this.entities[key].destroy();
      delete this.entities[key];
    });
  }
}
