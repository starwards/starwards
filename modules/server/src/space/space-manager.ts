import { SpaceObject, SpaceObjectBase, SpaceState, XY } from '@starwards/model';
import { Body, Collisions, Result } from 'detect-collisions';

export class SpaceManager {
    public state = new SpaceState(false); // this state tree should only be exposed by the space room
    public collisions = new Collisions();
    private collisionToState = new WeakMap<Body, SpaceObject>();
    private stateToCollision = new WeakMap<SpaceObject, Body>();

    public ChangeTurnSpeed(id: string, delta: number) {
        const subject = this.state.get(id);
        if (subject) {
            subject.turnSpeed += delta;
        }
    }
    public SetTurnSpeed(id: string, value: number) {
        const subject = this.state.get(id);
        if (subject) {
            subject.turnSpeed = value;
        }
    }
    public ChangeVelocity(id: string, delta: XY) {
        const subject = this.state.get(id);
        if (subject) {
            subject.velocity.x += delta.x;
            subject.velocity.y += delta.y;
        }
    }
    public SetVelocity(id: string, value: XY) {
        const subject = this.state.get(id);
        if (subject) {
            subject.velocity.x = value.x;
            subject.velocity.y = value.y;
        }
    }
    public moveObjects(ids: string[], delta: XY) {
        for (const id of ids) {
            const subject = this.state.get(id);
            if (subject) {
                SpaceObjectBase.moveObject(subject, delta);
            }
        }
    }

    public update(deltaMs: number) {
        this.applyPhysics(deltaMs / 1000);
        this.handleCollisions(deltaMs / 1000);
    }

    public async insert(object: SpaceObject) {
        this.state.set(object);
        const body = this.collisions.createCircle(object.position.x, object.position.y, object.radius);
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

    private resolveCollision(object: SpaceObject, otherObjext: SpaceObject, result: Result, deltaSeconds: number) {
        const collisionVector = {
            x: (result.overlap * result.overlap_x) / 2,
            y: (result.overlap * result.overlap_y) / 2,
        };
        // each colliding side backs off
        this.collideObject(object, XY.negate(collisionVector), deltaSeconds);
        this.collideObject(otherObjext, collisionVector, deltaSeconds);

        this.updateObjectCollision(object);
        this.updateObjectCollision(otherObjext);
    }

    // todo better collision behavior (plastic (bounce off) and elastic (smash) collision factors)
    // todo add spin
    private collideObject(otherObjext: SpaceObject, collisionVector: XY, deltaSeconds: number) {
        const elasticityFactor = 0.05; // how much velocity created
        SpaceObjectBase.moveObject(otherObjext, collisionVector);
        otherObjext.velocity.x += (elasticityFactor * collisionVector.x) / deltaSeconds;
        otherObjext.velocity.y += (elasticityFactor * collisionVector.y) / deltaSeconds;
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

    private handleCollisions(deltaSeconds: number) {
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
                            this.resolveCollision(object, otherObjext, result, deltaSeconds);
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
