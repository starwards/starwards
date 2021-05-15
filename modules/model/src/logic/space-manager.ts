import { Body, Circle, Collisions, Result } from 'detect-collisions';
import { CannonShell, Explosion, SpaceObject, SpaceState, Vec2, XY } from '../';

import { Spaceship } from '../space';
import { uniqueId } from '../id';

const GC_TIMEOUT = 5;

type Damage = {
    amount: number;
    position: XY;
    // x: number;
    // y: number;
};

export class SpaceManager {
    public state = new SpaceState(false); // this state tree should only be exposed by the space room
    public collisions = new Collisions();
    private collisionToState = new WeakMap<Body, SpaceObject>();
    public stateToCollision = new WeakMap<SpaceObject, Circle>();
    private objectDamage = new WeakMap<SpaceObject, Damage[]>();
    private toInsert: SpaceObject[] = [];

    private secondsSinceLastGC = 0;

    public ChangeTurnSpeed(id: string, delta: number) {
        const subject = this.state.get(id);
        if (subject && !subject.destroyed) {
            subject.turnSpeed += delta;
        }
    }
    public changeVelocity(id: string, delta: XY) {
        const subject = this.state.get(id);
        if (subject && !subject.destroyed) {
            subject.velocity.x += delta.x;
            subject.velocity.y += delta.y;
        }
    }

    private moveObjects(ids: string[], delta: XY) {
        for (const id of ids) {
            const subject = this.state.get(id);
            if (subject && !subject.destroyed) {
                Vec2.add(subject.position, delta, subject.position);
                this.updateObjectCollision(subject);
            }
        }
    }

    private rotateObjects(ids: string[], delta: number) {
        for (const id of ids) {
            const subject = this.state.get(id);
            if (subject && !subject.destroyed) {
                subject.angle = (360 + subject.angle + delta) % 360;
            }
        }
    }

    private toggleFreezeObjects(ids: string[]) {
        const allObjects = this.state.getBatch(ids);
        const isAllFrozen = allObjects.every((so) => so.freeze);
        for (const subject of allObjects) {
            subject.freeze = !isAllFrozen;
        }
    }

    // batch changes to map indexes to save i/o
    private gc() {
        this.secondsSinceLastGC = 0;
        for (const destroyed of this.state[Symbol.iterator](true)) {
            this.state.delete(destroyed);
        }
    }

    public update(deltaSeconds: number) {
        for (const moveCommand of this.state.moveCommands) {
            this.moveObjects(moveCommand.ids, moveCommand.delta);
        }
        this.state.moveCommands = [];

        for (const rotateCommand of this.state.rotateCommands) {
            this.rotateObjects(rotateCommand.ids, rotateCommand.delta);
        }
        this.state.rotateCommands = [];

        this.toggleFreezeObjects(this.state.toggleFreezeCommand);
        this.state.toggleFreezeCommand = [];

        this.growExplosions(deltaSeconds);
        this.destroyTimedOut(deltaSeconds);
        this.untrackDestroyedObjects();
        this.applyFreeze();
        this.applyPhysics(deltaSeconds);
        this.handleCollisions(deltaSeconds);
        this.handleToInsert();
        this.secondsSinceLastGC += deltaSeconds;
        if (this.secondsSinceLastGC > GC_TIMEOUT) {
            this.gc();
        }
    }

    private growExplosions(deltaSeconds: number) {
        for (const explosion of this.state.getAll('Explosion')) {
            if (!explosion.freeze) {
                explosion.radius += explosion.expansionSpeed * deltaSeconds;
                this.updateObjectCollision(explosion);
            }
        }
    }

    private destroyTimedOut(deltaSeconds: number) {
        for (const explosion of this.state.getAll('Explosion')) {
            if (!explosion.freeze) {
                explosion.secondsToLive -= deltaSeconds;
                if (explosion.secondsToLive <= 0) {
                    explosion.destroyed = true;
                }
            }
        }
        for (const shell of this.state.getAll('CannonShell')) {
            if (!shell.freeze) {
                shell.secondsToLive -= deltaSeconds;
                if (shell.secondsToLive <= 0) {
                    this.explodeCannonShell(shell);
                }
            }
        }
    }

    private untrackDestroyedObjects() {
        for (const destroyed of this.state[Symbol.iterator](true)) {
            const body = this.stateToCollision.get(destroyed);
            if (body) {
                this.stateToCollision.delete(destroyed);
                this.collisionToState.delete(body);
                this.collisions.remove(body);
            }
        }
    }

    public insert(object: SpaceObject) {
        this.toInsert.push(object);
    }

    public forceFlushEntities() {
        this.handleToInsert();
    }

    private handleToInsert() {
        if (this.toInsert.length) {
            this.gc();
            for (const object of this.toInsert) {
                this.state.set(object);
                const body = this.collisions.createCircle(object.position.x, object.position.y, object.radius);
                this.collisionToState.set(body, object);
                this.stateToCollision.set(object, body);
            }
            this.toInsert = [];
        }
    }

    private applyFreeze() {
        // loop over objects and apply velocity
        for (const object of this.state) {
            if (object.freeze) {
                object.velocity.x = object.velocity.y = object.turnSpeed = 0;
            }
        }
    }

    private applyPhysics(deltaSeconds: number) {
        // loop over objects and apply velocity
        for (const object of this.state) {
            if (object.velocity.x || object.velocity.y) {
                Vec2.add(object.position, XY.scale(object.velocity, deltaSeconds), object.position);
                this.updateObjectCollision(object);
            }
            if (object.turnSpeed) {
                object.angle = (360 + object.angle + object.turnSpeed * deltaSeconds) % 360;
            }
        }
    }

    private resolveCollision(object: SpaceObject, otherObject: SpaceObject, result: Result, deltaSeconds: number) {
        if (CannonShell.isInstance(object)) {
            this.explodeCannonShell(object);
        } else if (!Explosion.isInstance(object)) {
            if (Explosion.isInstance(otherObject)) {
                this.resolveExplosionEffect(object, otherObject, result, deltaSeconds);
            } else {
                this.resolveCrash(object, result, deltaSeconds);
            }
        }
    }

    private explodeCannonShell(shell: CannonShell) {
        shell.destroyed = true;
        const explosion = shell._explosion || new Explosion();
        explosion.init(uniqueId('explosion'), shell.position.clone());
        this.insert(explosion);
    }

    private resolveCrash(object: SpaceObject, result: Result, deltaSeconds: number) {
        const collisionVector = {
            x: -(result.overlap * result.overlap_x) / 2,
            y: -(result.overlap * result.overlap_y) / 2,
        };
        const elasticityFactor = 0.05; // how much velocity created
        Vec2.add(object.position, collisionVector, object.position);
        object.velocity.x += (elasticityFactor * collisionVector.x) / deltaSeconds;
        object.velocity.y += (elasticityFactor * collisionVector.y) / deltaSeconds;
    }

    private addDamageToObject(object: SpaceObject, damage: Damage) {
        const objectDamage = this.objectDamage.get(object);
        if (objectDamage === undefined) {
            this.objectDamage.set(object, [damage]);
        } else {
            objectDamage.push(damage);
        }
    }

    public *resolveObjectDamage(object: SpaceObject): IterableIterator<Damage> {
        const damageArr = this.objectDamage.get(object);
        if (damageArr !== undefined) {
            yield* damageArr;
            this.objectDamage.delete(object);
        }
    }

    private resolveExplosionEffect(object: SpaceObject, explosion: Explosion, result: Result, deltaSeconds: number) {
        const exposure = deltaSeconds * Math.min(result.overlap, explosion.radius * 2);
        const damageAmount = explosion.damageFactor * exposure;
        if (Spaceship.isInstance(object)) {
            this.addDamageToObject(object, {
                amount: damageAmount,
                position: explosion.position,
            });
        } else {
            object.health -= damageAmount;
        }
        object.velocity.x -= result.overlap_x * exposure * explosion.blastFactor;
        object.velocity.y -= result.overlap_y * exposure * explosion.blastFactor;
    }

    private updateObjectCollision(object: SpaceObject) {
        const body = this.stateToCollision.get(object);
        if (body) {
            body.x = object.position.x;
            body.y = object.position.y;
            body.radius = object.radius;
        } else {
            // eslint-disable-next-line no-console
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
            if (!object.freeze) {
                const body = this.stateToCollision.get(object);
                if (body) {
                    // Get any potential collisions
                    for (const potential of body.potentials()) {
                        const otherObjext = this.collisionToState.get(potential);
                        if (otherObjext && !otherObjext.destroyed && body.collides(potential, result)) {
                            this.resolveCollision(object, otherObjext, result, deltaSeconds);
                            toUpdate.add(object);
                            toUpdate.add(otherObjext);
                        }
                    }
                } else {
                    // eslint-disable-next-line no-console
                    console.error(`object leak! ${object.id} has no collision body`);
                }
            }
        }

        for (const object of toUpdate) {
            if (!object.destroyed) {
                this.updateObjectCollision(object);
            }
        }
    }
}
