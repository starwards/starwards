import * as PIXI from 'pixi.js';
import Viewport from 'pixi-viewport';
import { Client } from 'colyseus.js';
import { SpaceState, SpaceObject } from '@starwards/model';

const ENDPOINT = 'ws://localhost:8080'; // todo: use window.location

export const lerp = (a: number, b: number, t: number) => (b - a) * t + a;

type DisplayEntity = PIXI.DisplayObject & {
  [k: string]: any;
};

export class Radar extends PIXI.Application {
  public displayEntities: { [id: string]: DisplayEntity } = {};

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
      for (const id of Object.getOwnPropertyNames(this.displayEntities)) {
        const state = this.room.state.get(id);
        if (state) {
          const graphics = this.displayEntities[id];
          const screenPos = this.viewport.toScreen(state.position.x, state.position.y);
          graphics.x = lerp(
            graphics.x,
            screenPos.x,
            0.2 // TODO use object's speed instead of constant
          );
          graphics.y = lerp(
            graphics.y,
            screenPos.y,
            0.2 // TODO use object's speed instead of constant
          );
        }
      }
    }
    // continue looping
    requestAnimationFrame(this.loop.bind(this));
  }

  private setPosition(graphics: PIXI.DisplayObject, state: SpaceObject) {
    graphics.x = state.position.x;
    graphics.y = state.position.y;
  }

  private setScreenPosition(graphics: PIXI.DisplayObject, state: SpaceObject) {
    const screenPos = this.viewport.toScreen(state.position.x, state.position.y);
    graphics.x = screenPos.x;
    graphics.y = screenPos.y;
  }

  private setViewCenter(graphics: PIXI.DisplayObject) {
    this.viewCenter.x = graphics.x;
    this.viewCenter.y = graphics.y;
    this.viewport.moveCenter(this.viewCenter);
  }

  private initialize() {
    SpaceState.clientInit(this.room.state);
    this.room.state.asteroids.onAdd = (entity, key) => {
      const display = new PIXI.Container();
      this.setScreenPosition(display, entity);
      this.stage.addChild(display);
      this.viewport.on('zoomed', () => {
        this.setScreenPosition(display, entity);
      });
      this.viewport.on('moved', () => {
        this.setScreenPosition(display, entity);
      });
      this.displayEntities[key] = display;
      const graphics = new PIXI.Graphics();
      display.addChild(graphics);
      graphics.clear();
      graphics.lineStyle(0);
      graphics.beginFill(0xffff0b, 0.5);
      graphics.drawCircle(0, 0, 10);
      graphics.endFill();
      const text = new PIXI.Text(entity.id + '\nAsteroid',
        {fontFamily : 'Arial', fontSize: 12, fill : 0xffff0b, align : 'center'});
      text.y = 10;
      text.x = -text.getLocalBounds(new PIXI.Rectangle()).width / 2;
      display.addChild(text);
      entity.onChange = changes => {
        changes.forEach(_ => {
          if (!this.interpolation) {
            this.setScreenPosition(display, entity);
          }
        });
      };
    };

    // assume single spaceship
    this.room.state.spaceships.onAdd = (entity, key) => {
      const graphics = new PIXI.Graphics();
      this.setPosition(graphics, entity);
      this.setViewCenter(graphics);
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
            this.setPosition(graphics, entity);
            this.setViewCenter(graphics);
          }
        });
      };
    };

    this.room.state.registerOnRemove((_, key) => {
      this.viewport.removeChild(this.displayEntities[key]);
      this.displayEntities[key].destroy();
      delete this.displayEntities[key];
    });
  }
}
