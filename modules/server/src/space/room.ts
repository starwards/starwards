import { Room, Client } from 'colyseus';
import {
  SpaceState,
  XY,
  SpaceObject,
  SpaceCommand,
  isCommand,
  SpaceObjectBase
} from '@starwards/model';
import { map } from './map';
import { Result, Collisions, Body } from 'detect-collisions';

export class SpaceRoom extends Room<SpaceState> {
  public collisions = new Collisions();
  private collisionToState = new WeakMap<Body, SpaceObject>();
  private stateToCollision = new WeakMap<SpaceObject, Body>();
  private myLoopInterval: NodeJS.Timeout | undefined;

  constructor() {
    super();
    this.autoDispose = false;
  }

  public async onLeave(client: Client, consented: boolean) {
    if (!consented) {
      await this.allowReconnection(client, 30);
    }
  }

  public onInit() {
    this.setState(new SpaceState());
    this.setPatchRate(0);
    // take control over patch and simulation loops
    this.myLoopInterval = setInterval(() => {
      this.broadcastPatch();
      this.broadcastAfterPatch();
      this.update(this.clock.deltaTime);
    }, 1000 / 20);
    map.forEach(o => this.insert(o.clone()));
  }

  public onDispose() {
    if (this.myLoopInterval) {
      clearInterval(this.myLoopInterval);
      this.myLoopInterval = undefined;
    }
  }

  public onMessage(_client: Client, message: SpaceCommand): void {
    const subject = this.state.get(message.id);
    if (subject) {
      if (isCommand('ChangeTurnSpeed', message)) {
        subject.turnSpeed += message.delta;
      } else if (isCommand('SetTurnSpeed', message)) {
        subject.turnSpeed = message.value;
      } else if (isCommand('ChangeVelocity', message)) {
        subject.velocity.x += message.delta.x;
        subject.velocity.y += message.delta.y;
      } else if (isCommand('SetVelocity', message)) {
        subject.velocity.x = message.value.x;
        subject.velocity.y = message.value.y;
      } else {
        throw new Error('Method not implemented.');
      }
    }
  }

  public insert(object: SpaceObject) {
    this.state.set(object);
    const body = this.collisions.createCircle(
      object.position.x,
      object.position.y,
      object.radius
    );
    this.collisionToState.set(body, object);
    this.stateToCollision.set(object, body);
  }

  public delete(object: SpaceObject) {
    this.state.delete(object);
    const body = this.stateToCollision.get(object)!;
    this.stateToCollision.delete(object);
    this.collisionToState.delete(body);
    this.collisions.remove(body);
  }

  private update(deltaMs: number) {
    this.applyPhysics(deltaMs / 1000);
    this.handleCollisions();
  }

  private updateObjectCollision(object: SpaceObject) {
    const body = this.stateToCollision.get(object);
    if (body) {
      body.x = object.position.x;
      body.y = object.position.y;
    } else {
      // tslint:disable-next-line:no-console
      console.error(`object leak! ${object.id} has no collision body`);
    }
  }

  private applyPhysics(deltaSeconds: number) {
    // loop over objects and apply velocity
    for (const object of this.state) {
      if (object.velocity.x || object.velocity.y) {
        SpaceObjectBase.moveObject(object, object.velocity, deltaSeconds);
        this.updateObjectCollision(object);
      }
      if (object.turnSpeed) {
        SpaceObjectBase.rotateObject(object, object.turnSpeed, deltaSeconds);
      }
    }
  }

  // todo better collision behavior (plastic (bounce off) and elastic (smash) collision factors)
  private resolveCollision(
    object: SpaceObject,
    otherObjext: SpaceObject,
    result: Result
  ) {
    const collisionVector = {
      x: (result.overlap * result.overlap_x) / 2,
      y: (result.overlap * result.overlap_y) / 2
    };
    // each colliding side backs off
    SpaceObjectBase.moveObject(object, XY.negate(collisionVector));
    SpaceObjectBase.moveObject(otherObjext, collisionVector);
    this.updateObjectCollision(object);
    this.updateObjectCollision(otherObjext);
  }

  private handleCollisions() {
    // update collisions state
    this.collisions.update();
    const result = new Result();
    // for every moving object
    for (const object of this.state) {
      if (object.velocity.x || object.velocity.y) {
        const body = this.stateToCollision.get(object);
        if (body) {
          // Get any potential collisions
          for (const potential of body.potentials()) {
            if (body.collides(potential, result)) {
              const otherObjext = this.collisionToState.get(potential)!;
              this.resolveCollision(object, otherObjext, result);
            }
          }
        } else {
          // tslint:disable-next-line:no-console
          console.error(`object leak! ${object.id} has no collision body`);
        }
      }
    }
  }
}
