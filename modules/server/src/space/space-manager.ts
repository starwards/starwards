import { SpaceObject, SpaceObjectBase, SpaceState, XY } from '@starwards/model';
import { Body, Collisions, Result } from 'detect-collisions';

const GC_TIMEOUT = 5;
export class SpaceManager {
    public state = new SpaceState(false); // this state tree should only be exposed by the space room
    public collisions = new Collisions();
    private collisionToState = new WeakMap<Body, SpaceObject>();
    private stateToCollision = new WeakMap<SpaceObject, Body>();

    private secondsSinceLastGC = 0;

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

    // batch changes to map indexes to save i/o
    private gc() {
        this.secondsSinceLastGC = 0;
        for (const destroyed of this.state[Symbol.iterator](true)) {
            this.state.delete(destroyed);
        }
    }

    public update(deltaMs: number) {
        const deltaSeconds = deltaMs / 1000;
        this.destroyOldShells(deltaSeconds);
        this.untrackDestroyedObjects();
        this.applyPhysics(deltaSeconds);
        this.handleCollisions(deltaSeconds);
        this.secondsSinceLastGC += deltaSeconds;
        if (this.secondsSinceLastGC > GC_TIMEOUT) {
            this.gc();
        }
    }

    private destroyOldShells(deltaSeconds: number) {
        for (const shell of this.state.getAll('CannonShell')) {
            shell.secondsToLive -= deltaSeconds;
            if (shell.secondsToLive <= 0) {
                shell.destroyed = true;
            }
        }
    }

    private untrackDestroyedObjects() {
        for (const destroyed of this.state[Symbol.iterator](true)) {
            const body = this.stateToCollision.get(destroyed)!;
            if (body) {
                this.stateToCollision.delete(destroyed);
                this.collisionToState.delete(body);
                this.collisions.remove(body);
            }
        }
    }

    public insert(object: SpaceObject) {
        this.gc();
        this.state.set(object);
        const body = this.collisions.createCircle(object.position.x, object.position.y, object.radius);
        this.collisionToState.set(body, object);
        this.stateToCollision.set(object, body);
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

    private resolveCollision(object: SpaceObject, otherObject: SpaceObject, result: Result, deltaSeconds: number) {
        const collisionVector = {
            x: -(result.overlap * result.overlap_x) / 2,
            y: -(result.overlap * result.overlap_y) / 2,
        };
        // each colliding side backs off
        object.collide(otherObject, collisionVector, deltaSeconds);
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
        const toUpdate = new Set<SpaceObject>();
        // for every moving object
        for (const object of this.state) {
            const body = this.stateToCollision.get(object);
            if (body) {
                // Get any potential collisions
                for (const potential of body.potentials()) {
                    const otherObjext = this.collisionToState.get(potential)!;
                    if (body.collides(potential, result)) {
                        this.resolveCollision(object, otherObjext, result, deltaSeconds);
                        toUpdate.add(object);
                        toUpdate.add(otherObjext);
                    }
                }
            } else {
                // tslint:disable-next-line:no-console
                console.error(`object leak! ${object.id} has no collision body`);
            }
        }

        for (const object of toUpdate) {
            if (!object.destroyed) {
                this.updateObjectCollision(object);
            }
        }
    }
}
