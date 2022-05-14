import { CannonShell, Explosion, SpaceObject, SpaceState, Vec2, XY } from '../';
import { Circle, Polygon, Response, System, TBody } from 'detect-collisions';
import { circlesIntersection, limitPercision } from '.';

import { Spaceship } from '../space';
import { uniqueId } from '../id';

const GC_TIMEOUT = 5;

export type Damage = {
    amount: number;
    damageSurfaceArc: [number, number];
    damageDurationSeconds: number;
};

export class SpaceManager {
    public state = new SpaceState(false); // this state tree should only be exposed by the space room
    public collisions = new System();
    private collisionToState = new WeakMap<TBody, SpaceObject>();
    public projectileStateToCollision = new WeakMap<SpaceObject, Polygon>();
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

    private moveObjects(deltaSeconds: number, ids: string[], delta: XY) {
        for (const id of ids) {
            const subject = this.state.get(id);
            if (subject && !subject.destroyed) {
                Vec2.add(subject.position, delta, subject.position);
                this.updateObjectCollision(deltaSeconds, subject);
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
            this.moveObjects(deltaSeconds, moveCommand.ids, moveCommand.delta);
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
        this.handleToInsert(deltaSeconds);
        this.secondsSinceLastGC += deltaSeconds;
        if (this.secondsSinceLastGC > GC_TIMEOUT) {
            this.gc();
        }
    }

    private growExplosions(deltaSeconds: number) {
        for (const explosion of this.state.getAll('Explosion')) {
            if (!explosion.freeze) {
                explosion.radius += explosion.expansionSpeed * deltaSeconds;
                this.updateObjectCollision(deltaSeconds, explosion);
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
            if (CannonShell.isInstance(destroyed)) {
                const body = this.projectileStateToCollision.get(destroyed);
                if (body) {
                    this.projectileStateToCollision.delete(destroyed);
                    this.collisionToState.delete(body);
                    this.collisions.remove(body);
                }
            } else {
                const body = this.stateToCollision.get(destroyed);
                if (body) {
                    this.stateToCollision.delete(destroyed);
                    this.collisionToState.delete(body);
                    this.collisions.remove(body);
                }
            }
        }
    }

    public insert(object: SpaceObject) {
        this.toInsert.push(object);
    }

    public insertBulk(objects: SpaceObject[]) {
        this.toInsert.push(...objects);
    }

    public forceFlushEntities() {
        this.handleToInsert(1 / 20);
    }

    private handleToInsert(deltaSeconds: number) {
        if (this.toInsert.length) {
            this.gc();
            for (const object of this.toInsert) {
                this.state.set(object);
                if (CannonShell.isInstance(object)) {
                    const body = this.collisions.createPolygon(XY.clone(object.position), [
                        XY.zero,
                        XY.scale(object.velocity, deltaSeconds),
                    ]);
                    this.collisionToState.set(body, object);
                    this.projectileStateToCollision.set(object, body);
                } else {
                    const body = this.collisions.createCircle(XY.clone(object.position), object.radius);
                    this.collisionToState.set(body, object);
                    this.stateToCollision.set(object, body);
                }
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
                this.updateObjectCollision(deltaSeconds, object);
            }
            if (object.turnSpeed) {
                object.angle = (360 + object.angle + object.turnSpeed * deltaSeconds) % 360;
            }
        }
    }

    private resolveCollision(object: SpaceObject, otherObject: SpaceObject, result: Response, deltaSeconds: number) {
        if (CannonShell.isInstance(object)) {
            const distance = XY.difference(object.position, otherObject.position);
            const distLength = XY.lengthOf(distance);
            if (distLength != 0) {
                Vec2.sum(
                    otherObject.position,
                    XY.scale(distance, (object.radius + otherObject.radius) / distLength),
                    object.position
                );
            }
            this.explodeCannonShell(object);
        } else if (!Explosion.isInstance(object) && !CannonShell.isInstance(otherObject)) {
            let damageAmount: number | undefined = undefined;
            if (Explosion.isInstance(otherObject)) {
                const exposure = deltaSeconds * Math.min(result.overlap, otherObject.radius * 2);
                object.velocity.x -= result.overlapV.x * exposure * otherObject.blastFactor;
                object.velocity.y -= result.overlapV.y * exposure * otherObject.blastFactor;
                damageAmount =
                    otherObject.damageFactor * deltaSeconds * Math.min(result.overlap, otherObject.radius * 2);
            } else {
                const collisionVector = XY.scale(result.overlapV, -0.5);
                Vec2.add(object.position, collisionVector, object.position);
                Vec2.add(
                    object.velocity,
                    XY.scale(collisionVector, object.collisionElasticity / deltaSeconds),
                    object.velocity
                );
                damageAmount = object.collisionDamage * Math.min(result.overlap, otherObject.radius * 2);
            }
            if (Spaceship.isInstance(object)) {
                const damageBoundries = circlesIntersection(
                    object.position,
                    otherObject.position,
                    object.radius,
                    otherObject.radius
                );
                if (damageBoundries) {
                    const shipLocalDamageBoundries: [XY, XY] = [
                        object.globalToLocal(XY.difference(damageBoundries[0], object.position)),
                        object.globalToLocal(XY.difference(damageBoundries[1], object.position)),
                    ];
                    const shipLocalDamageAngles: [number, number] = [
                        limitPercision(XY.angleOf(shipLocalDamageBoundries[0])),
                        limitPercision(XY.angleOf(shipLocalDamageBoundries[1])),
                    ];
                    const damage = {
                        amount: damageAmount,
                        damageSurfaceArc: shipLocalDamageAngles,
                        damageDurationSeconds: deltaSeconds,
                    };
                    const objectDamage = this.objectDamage.get(object);
                    if (objectDamage === undefined) {
                        this.objectDamage.set(object, [damage]);
                    } else {
                        objectDamage.push(damage);
                    }
                } else {
                    // eslint-disable-next-line no-console
                    console.error(`unexpected undefined intersection between ${otherObject.type} and object.
                    object data: centre: ${JSON.stringify(object.position)} radius: ${JSON.stringify(object.radius)}
                    ${otherObject.type} data: centre: ${JSON.stringify(otherObject.position)} radius: ${JSON.stringify(
                        otherObject.radius
                    )}`);
                }
            } else {
                object.health -= damageAmount;
            }
        }
    }

    private explodeCannonShell(shell: CannonShell) {
        shell.destroyed = true;
        const explosion = shell._explosion || new Explosion();
        explosion.init(uniqueId('explosion'), shell.position.clone());
        this.insert(explosion);
    }

    public *resolveObjectDamage(object: SpaceObject): IterableIterator<Damage> {
        const damageArr = this.objectDamage.get(object);
        if (damageArr !== undefined) {
            yield* damageArr;
            this.objectDamage.delete(object);
        }
    }

    private updateObjectCollision(deltaSeconds: number, object: SpaceObject) {
        if (CannonShell.isInstance(object)) {
            const body = this.projectileStateToCollision.get(object);
            if (body) {
                body.setPosition(object.position.x, object.position.y);
                const newLineEnd = XY.scale(object.velocity, deltaSeconds);
                body.points[1].x = newLineEnd.x;
                body.points[1].y = newLineEnd.y;
                body.setPoints(body.points);
            } else {
                // eslint-disable-next-line no-console
                console.error(`CannonShell object leak! ${object.id} has no collision body`);
            }
        } else {
            const body = this.stateToCollision.get(object);
            if (body) {
                body.setPosition(object.position.x, object.position.y);
                body.r = object.radius;
            } else {
                // eslint-disable-next-line no-console
                console.error(`object leak! ${object.id} has no collision body`);
            }
        }
    }

    private handleCollisions(deltaSeconds: number) {
        // update collisions state
        this.collisions.update();
        const toUpdate = new Set<SpaceObject>();
        this.collisions.checkAll((response) => {
            const object = this.collisionToState.get(response.a as TBody);
            const otherObjext = this.collisionToState.get(response.b as TBody);
            if (object && !object.destroyed && !object.freeze && otherObjext && !otherObjext.destroyed) {
                this.resolveCollision(object, otherObjext, response, deltaSeconds);
                toUpdate.add(object);
                toUpdate.add(otherObjext);
            }
        });

        for (const object of toUpdate) {
            if (!object.destroyed) {
                this.updateObjectCollision(deltaSeconds, object);
            }
        }
    }
}
