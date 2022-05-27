import { CannonShell, Explosion, SpaceObject, SpaceState, Vec2, XY } from '../';
import { Circle, System, TBody, Types } from 'detect-collisions';
import { Ray, SWResponse } from './collisions-utils';
import { circlesIntersection, findCircleRayIntersections, limitPercision, minDistanceXY } from '.';

import { MultiMap } from '../utils';
import { Spaceship } from '../space';
import { uniqueId } from '../id';

const GC_TIMEOUT = 5;

export type Damage = {
    id: string;
    amount: number;
    damageSurfaceArc: [number, number];
    damageDurationSeconds: number;
};

export class SpaceManager {
    public state = new SpaceState(false); // this state tree should only be exposed by the space room
    public collisions = new System();
    private collisionToState = new WeakMap<TBody, SpaceObject>();
    public projectileStateToCollision = new WeakMap<CannonShell, Ray>();
    public stateToCollision = new WeakMap<Exclude<SpaceObject, CannonShell>, Circle>();
    private objectDamage = new Map<string, Damage[]>();
    private toInsert: SpaceObject[] = [];

    private toUpdateCollisions = new Set<SpaceObject>();
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
                this.toUpdateCollisions.add(subject);
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
        this.untrackDestroyedObjects();
        this.secondsSinceLastGC = 0;
        for (const destroyed of this.state[Symbol.iterator](true)) {
            this.state.delete(destroyed);
            this.objectDamage.delete(destroyed.id);
        }
    }

    public update(deltaSeconds: number) {
        this.toUpdateCollisions.clear();
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
        this.updateCollisionBodies(deltaSeconds);
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
                this.toUpdateCollisions.add(explosion);
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
                    const body = new Ray(object.position, XY.scale(object.velocity, deltaSeconds));
                    this.collisions.insert(body);
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
                this.toUpdateCollisions.add(object);
            }
            if (object.turnSpeed) {
                object.angle = (360 + object.angle + object.turnSpeed * deltaSeconds) % 360;
            }
        }
    }

    private explodeCannonShell(shell: CannonShell) {
        shell.destroyed = true;
        const explosion = shell._explosion || new Explosion();
        explosion.init(uniqueId('explosion'), shell.position.clone());
        this.insert(explosion);
    }

    public *resolveObjectDamage(id: string): IterableIterator<Damage> {
        const damageArr = this.objectDamage.get(id);
        if (damageArr !== undefined) {
            yield* damageArr;
            this.objectDamage.delete(id);
        }
    }

    private handleCollisions(deltaSeconds: number) {
        const positionChanges: Array<{ s: SpaceObject; p: XY }> = [];
        const projectileCollisions = new MultiMap<CannonShell, XY>();
        // find and handle collisions
        this.collisions.checkAll((response: SWResponse) => {
            const subject = this.collisionToState.get(response.a);
            const object = this.collisionToState.get(response.b);
            if (
                subject &&
                !Explosion.isInstance(subject) &&
                !subject.destroyed &&
                !subject.freeze &&
                object &&
                !CannonShell.isInstance(object) &&
                !object.destroyed
            ) {
                if (CannonShell.isInstance(subject)) {
                    if (response.a.type == Types.Line) {
                        projectileCollisions.push(
                            subject,
                            ...findCircleRayIntersections(response.a.globalPoints, object)
                        );
                    } else {
                        // eslint-disable-next-line no-console
                        console.error(`CannonShell collision shape is not Polygon: ${response.a.type}`);
                    }
                } else {
                    const p = this.handleNonProjectileCollision(deltaSeconds, subject, object, response);
                    if (p) {
                        positionChanges.push({ s: subject, p });
                    }
                }
            }
        });
        for (const [projectile, hits] of projectileCollisions.entries()) {
            // const _ship = this.state.spaceships.get('ship');
            // _ship?.toJSON?.();
            const closest = minDistanceXY(projectile.position, hits, hits[0]);
            projectile.position.setValue(closest);
            this.explodeCannonShell(projectile);
        }
        for (const { s: o, p } of positionChanges) {
            Vec2.add(o.position, p, o.position);
            this.toUpdateCollisions.add(o);
        }
    }

    private handleNonProjectileCollision(
        deltaSeconds: number,
        subject: Exclude<SpaceObject, CannonShell | Explosion>,
        object: Exclude<SpaceObject, CannonShell>,
        response: SWResponse
    ) {
        let positionChange: XY | null = null;
        let damageAmount: number | undefined = undefined;
        if (Explosion.isInstance(object)) {
            const exposure = deltaSeconds * Math.min(response.overlap, object.radius * 2);
            subject.velocity.x -= response.overlapV.x * exposure * object.blastFactor;
            subject.velocity.y -= response.overlapV.y * exposure * object.blastFactor;
            damageAmount = object.damageFactor * deltaSeconds * Math.min(response.overlap, object.radius * 2);
        } else {
            const collisionVector = XY.scale(response.overlapV, -0.5);
            positionChange = collisionVector;
            Vec2.add(
                subject.velocity,
                XY.scale(collisionVector, subject.collisionElasticity / deltaSeconds),
                subject.velocity
            );
            damageAmount = subject.collisionDamage * Math.min(response.overlap, object.radius * 2);
        }
        if (Spaceship.isInstance(subject)) {
            const damageBoundries = circlesIntersection(subject, object);
            if (damageBoundries) {
                const shipLocalDamageBoundries: [XY, XY] = [
                    subject.globalToLocal(XY.difference(damageBoundries[0], subject.position)),
                    subject.globalToLocal(XY.difference(damageBoundries[1], subject.position)),
                ];
                const shipLocalDamageAngles: [number, number] = [
                    limitPercision(XY.angleOf(shipLocalDamageBoundries[0])),
                    limitPercision(XY.angleOf(shipLocalDamageBoundries[1])),
                ];
                const damage = {
                    id: object.id,
                    amount: damageAmount,
                    damageSurfaceArc: shipLocalDamageAngles,
                    damageDurationSeconds: deltaSeconds,
                };
                const objectDamage = this.objectDamage.get(subject.id);
                if (objectDamage === undefined) {
                    this.objectDamage.set(subject.id, [damage]);
                } else {
                    objectDamage.push(damage);
                }
            } else {
                // eslint-disable-next-line no-console
                console.error(
                    `unexpected undefined intersection with Spaceship.\n${collisionErrorMsg(object, subject, response)}`
                );
            }
        } else {
            subject.health -= damageAmount;
        }
        return positionChange;
    }

    private updateCollisionBodies(deltaSeconds: number) {
        for (const object of this.toUpdateCollisions) {
            if (!object.destroyed) {
                if (CannonShell.isInstance(object)) {
                    const body = this.projectileStateToCollision.get(object);
                    if (body) {
                        const newLineEnd = XY.scale(object.velocity, deltaSeconds);
                        body.points[1].x = newLineEnd.x;
                        body.points[1].y = newLineEnd.y;
                        body.setPoints(body.points);
                        body.setPosition(object.position.x, object.position.y);
                    } else {
                        // eslint-disable-next-line no-console
                        console.error(`CannonShell object leak! ${object.id} has no collision body`);
                    }
                } else {
                    const body = this.stateToCollision.get(object);
                    if (body) {
                        body.r = object.radius;
                        body.setPosition(object.position.x, object.position.y);
                    } else {
                        // eslint-disable-next-line no-console
                        console.error(`object leak! ${object.id} has no collision body`);
                    }
                }
            }
        }
        this.collisions.update();
        // reset toUpdateCollisions
        this.toUpdateCollisions.clear();
    }
}
function collisionErrorMsg(object: SpaceObject, subject: SpaceObject, response: SWResponse) {
    return `Subject ${subject.type} data: centre: ${JSON.stringify(subject.position)}(${JSON.stringify(
        response.a.pos
    )}) radius: ${JSON.stringify(subject.radius)}\n Object ${object.type} data: centre: ${JSON.stringify(
        object.position
    )}(${JSON.stringify(response.b.pos)}) radius: ${JSON.stringify(object.radius)}. state distance: ${XY.lengthOf(
        XY.difference(subject.position, object.position)
    )}. collision distance: ${XY.lengthOf(XY.difference(response.a.pos, response.b.pos))}`;
}
