import {
    Asteroid,
    Derelict,
    Faction,
    RadarSectorValues,
    ScanLevel,
    Spaceship,
    Waypoint,
    applyRadarSectors,
    isSensorInvisible,
} from '../space';
import { Body, Circle, System } from 'detect-collisions';
import {
    EPSILON,
    FieldOfView,
    Tuple2,
    addScale,
    circlesIntersection,
    limitPercision,
    moveToTarget,
    predictInterceptPoint,
    rotateToTarget,
    sectorCovers,
    toDegreesDelta,
    toPositiveDegreesDelta,
} from '.';
import { Explosion, HazardCloud, Nebula, Projectile, SpaceObject, SpaceState, Vec2, XY } from '../';
import { IterationData, Updateable } from '../updateable';
import { makeId, uniqueId } from '../id';

import { DamageDelivery } from '../space/projectile';
import { FactionIntelManager } from './faction-intel-manager';
import { SWResponse } from './collisions-utils';
import { SpaceDamageType } from '../space/damage-profile';
import { applyLockCommands } from '../lock-commands';
import { avoidObstacles } from './obstacle-avoidance';
import { createLogger } from '../logger';
import { drainCommands } from '../commands';

const { warn: logWarn, error: logError } = createLogger('space-manager');

const GC_TIMEOUT = 5;
const ZERO_VELOCITY_THRESHOLD = 0;
/**
 * dragonfly-MK1's hull radius (modules/core/src/configurations/dragonfly-mk1.ts) — the mass-scaling
 * normalization point for blast-impulse pushback, so the smallest combat hull keeps today's feel
 * exactly (issue #2092 design redirect).
 */
const BLAST_IMPULSE_MASS_REFERENCE_RADIUS = 11.2;

// hard clamp on any object's speed, enforced at the physics layer after every velocity mutation
// (thrust, collision/blast impulse, explosion velocity-inheritance). Sits above the ship
// flight-computer's own (soft) maxSpeed and above projectile speeds.
export const ABSOLUTE_MAX_SPEED = 2000;

export type Damage = {
    id: string;
    amount: number;
    damageSurfaceArc: Tuple2;
    damageDurationSeconds: number;
    // 'Collision' for generic kinetic hits (collisions, GM-spawned explosions)
    damageType: SpaceDamageType;
    // impact: one event from a physical hit. explosion: one event of a blast-overlap stream.
    // solid collisions are tagged impact (inert — the Collision type routes past weapon logic).
    delivery: DamageDelivery;
    // id of the ship whose weapon caused this damage; empty for non-weapon damage (plain collisions)
    shipId: string;
    /** Defect scaling of the round that dealt this (see `WarheadDesign.concentration`); absent = 1. */
    concentration?: number;
};

type NoOrder = {
    type: 'none';
};
type MoveOrder = {
    type: 'move';
    position: XY;
};
type AttackOrder = {
    type: 'attack';
    targetId: string;
};
type FollowOrder = {
    type: 'follow';
    targetId: string;
};
type ExtraData = {
    body: Circle;
    fov: FieldOfView;
};
export type BotOrder = NoOrder | MoveOrder | AttackOrder | FollowOrder;
const nullPtr = [] as readonly [];
export type SpatialIndex = {
    selectPotentials(area: Body): Iterable<SpaceObject>;
};

export class SpaceManager implements Updateable {
    static destroyObject(state: SpaceState, id: string) {
        const subject = state.get(id);
        if (subject && !subject.destroyed && subject.expendable) {
            if (Spaceship.isInstance(subject)) {
                state.destroySpaceshipCommands.push(id);
            }
            subject.destroyed = true;
        }
    }

    public state = new SpaceState(false); // this state tree should only be exposed by the space room
    public collisions = new System();
    private collisionToState = new WeakMap<Body, SpaceObject>();
    private stateToExtraData = new WeakMap<SpaceObject, ExtraData>();
    private attachments = new Map<string, string>();
    private attachmentCliques = new Map<string, Set<SpaceObject>>();
    private objectDamage = new Map<string, Damage[]>();
    /** Ids of missiles a jamming scan beam covered this tick; drained by `updateJamLevels`. */
    private jamCoveredMissileIds = new Set<string>();
    private objectOrder = new Map<string, BotOrder>();
    private toInsert: SpaceObject[] = [];

    private cleanupBodies: Body[] = [];
    private toUpdateCollisions = new Set<SpaceObject>();
    private secondsSinceLastGC = 0;
    public readonly factionIntel = new FactionIntelManager(this.state);

    public spatialIndex = ((mgr: SpaceManager) => ({
        *selectPotentials(area: Body): Iterable<SpaceObject> {
            // a bbox search, not an inserted body: a temporary body would stay in the tree through checkAll
            for (const potential of mgr.collisions.search(area.getAABBAsBBox()) as Body[]) {
                const object = mgr.collisionToState.get(potential);
                if (object && !object.destroyed) {
                    yield object;
                }
            }
        },
        *queryArea(area: Body): Iterable<SpaceObject> {
            mgr.collisions.insert(area);
            mgr.cleanupBodies.push(area);
            for (const potential of mgr.collisions.getPotentials(area)) {
                const object = mgr.collisionToState.get(potential);
                if (object && !object.destroyed && mgr.collisions.checkCollision(area, potential)) {
                    yield object;
                }
            }
        },
    }))(this);

    public changeTurnSpeed(id: string, delta: number) {
        const [subject] = this.getObjectPtr(id);
        if (subject) {
            subject.turnSpeed += delta;
        }
    }
    public changeVelocity(id: string, delta: XY) {
        const [subject] = this.getObjectPtr(id);
        if (subject) {
            subject.velocity.x += delta.x;
            subject.velocity.y += delta.y;
            this.clampToAbsoluteMaxSpeed(subject);
        }
    }
    /**
     * Flags the explosion (by id) as having landed a hit on an already-broken armor section, so
     * clients render it as a hull-penetration hit instead of an exterior surface burst.
     */
    public markBreachHit(id: string) {
        const [object] = this.getObjectPtr(id);
        if (object && Explosion.isInstance(object)) {
            object.breachHit = true;
        }
    }
    /**
     * Credits a weapon hit to the shooter regardless of damage dealt — a shot that only
     * scratches armor still counts. Called once per resolved weapon-damage event, independent
     * of whether any system actually took a defect.
     */
    public registerHit(shooterId: string) {
        if (!shooterId) {
            return;
        }
        const [object] = this.getObjectPtr(shooterId);
        if (object && Spaceship.isInstance(object)) {
            object.hitsLanded++;
        }
    }
    public setVelocity(id: string, velocity: XY) {
        if (isNaN(velocity.x) || isNaN(velocity.y)) {
            logWarn(`trying to set "NaN" in velocity of ${id}`);
            return;
        }
        const [subject] = this.getObjectPtr(id);
        if (subject) {
            subject.velocity.setValue(velocity);
            this.clampToAbsoluteMaxSpeed(subject);
        }
    }

    private clampToAbsoluteMaxSpeed(subject: SpaceObject) {
        if (XY.lengthOf(subject.velocity) > ABSOLUTE_MAX_SPEED) {
            subject.velocity.normalize(ABSOLUTE_MAX_SPEED);
        }
    }

    private handleMoveCommand(ids: string[], delta: XY) {
        for (const subject of this.getAttachedClique(ids)) {
            Vec2.add(subject.position, delta, subject.position);
            this.toUpdateCollisions.add(subject);
        }
    }

    getObjectPtr(id: string): readonly [SpaceObject] | readonly [] {
        const o = this.state.get(id);
        return o && !o.destroyed ? [o] : nullPtr;
    }

    destroyObject(id: string) {
        SpaceManager.destroyObject(this.state, id);
    }

    /**
     * NPC systems-broken death (issue #2111): instead of vanishing, an expendable ship is
     * replaced with an inert Derelict at the same position, carrying its radius, faction,
     * callsign, angle, velocity, turn speed and model -- the hulk keeps drifting/tumbling as it
     * was at the moment of death, and its blip stays recognizable as the ship it was. No
     * type-conversion machinery exists for space objects, so this is
     * delete (via `destroyObject`, which also still queues the ship-room teardown) + insert a
     * new object, same as every other object-type transition.
     */
    convertToDerelict(id: string) {
        const subject = this.state.getShip(id);
        if (!subject || subject.destroyed || !subject.expendable) {
            return;
        }
        const derelict = new Derelict().init(
            makeId(),
            Vec2.make(subject.position),
            subject.radius,
            subject.faction,
            subject.callsign,
            subject.angle,
            subject.model,
        );
        derelict.velocity = Vec2.make(subject.velocity);
        derelict.turnSpeed = subject.turnSpeed;
        SpaceManager.destroyObject(this.state, id);
        this.insert(derelict);
    }

    private calcAttachmentCliques() {
        this.attachmentCliques.clear();
        for (const [attacherId, attacheeId] of this.attachments.entries()) {
            const clique = new Set<SpaceObject>();
            for (const obj of this.attachmentCliques.get(attacherId) || this.getObjectPtr(attacherId)) {
                clique.add(obj);
                this.attachmentCliques.set(obj.id, clique);
            }
            for (const obj of this.attachmentCliques.get(attacheeId) || this.getObjectPtr(attacheeId)) {
                clique.add(obj);
                this.attachmentCliques.set(obj.id, clique);
            }
        }
    }

    private getAttachedClique(ids: string[]) {
        const result = new Set<SpaceObject>(); // use set to not emit same object twice
        for (const id of ids) {
            for (const obj of this.attachmentCliques.get(id) || this.getObjectPtr(id)) {
                result.add(obj);
            }
        }
        return result;
    }

    // batch changes to map indexes to save i/o
    private gc() {
        this.untrackDestroyedObjects();
        this.secondsSinceLastGC = 0;
        for (const destroyed of this.state[Symbol.iterator](true)) {
            this.state.delete(destroyed);
            this.objectDamage.delete(destroyed.id);
            this.objectOrder.delete(destroyed.id);
        }
    }

    update({ deltaSeconds, totalSeconds }: IterationData) {
        // apply GM lock/unlock commands before anything else can write a locked field this tick
        applyLockCommands(this.state);
        this.calcAttachmentCliques();
        drainCommands('createAsteroid', this.state.createAsteroidCommands, (cmd) => {
            const asteroid = new Asteroid().init(makeId(), Vec2.make(cmd.position), cmd.radius);
            this.insert(asteroid);
        });
        this.state.createAsteroidCommands = [];
        drainCommands('createExplosion', this.state.createExplosionCommands, (cmd) => {
            const explosion = new Explosion().init(makeId(), Vec2.make(cmd.position), cmd.damageFactor);
            this.insert(explosion);
        });
        this.state.createExplosionCommands = [];
        drainCommands('createNebula', this.state.createNebulaCommands, (cmd) => {
            const nebula = new Nebula().init(makeId(), Vec2.make(cmd.position), cmd.radius);
            this.insert(nebula);
        });
        this.state.createNebulaCommands = [];
        drainCommands('createWaypoint', this.state.createWaypointCommands, (cmd) => {
            const waypoint = new Waypoint().init(makeId(), Vec2.make(cmd.position));
            if (cmd.owner != null) waypoint.owner = cmd.owner;
            if (cmd.title) waypoint.title = cmd.title;
            if (cmd.collection) waypoint.collection = cmd.collection;
            if (cmd.color !== undefined) waypoint.color = cmd.color;
            this.insert(waypoint);
        });
        this.state.createWaypointCommands = [];
        this.handleToInsert();
        drainCommands('move', this.state.moveCommands, (moveCommand) =>
            this.handleMoveCommand(moveCommand.ids, moveCommand.delta),
        );
        this.state.moveCommands = [];

        drainCommands('botOrder', this.state.botOrderCommands, (cmd) => {
            if (cmd.order.type === 'move' && cmd.ids.length > 1) {
                // For multi-ship move orders, preserve relative formation
                const ships: Array<{ id: string; position: XY }> = [];
                for (const id of cmd.ids) {
                    const [subject] = this.getObjectPtr(id);
                    if (subject && Spaceship.isInstance(subject)) {
                        ships.push({ id, position: XY.clone(subject.position) });
                    }
                }
                if (ships.length > 1) {
                    const center = XY.scale(XY.sum(...ships.map((s) => s.position)), 1 / ships.length);
                    for (const ship of ships) {
                        const offset = XY.difference(ship.position, center);
                        this.objectOrder.set(ship.id, {
                            type: 'move',
                            position: XY.add(cmd.order.position, offset),
                        });
                    }
                } else if (ships.length === 1) {
                    this.objectOrder.set(ships[0].id, cmd.order);
                }
            } else {
                for (const id of cmd.ids) {
                    const [subject] = this.getObjectPtr(id);
                    if (subject && Spaceship.isInstance(subject)) {
                        this.objectOrder.set(id, cmd.order);
                    }
                }
            }
        });
        this.state.botOrderCommands = [];

        this.growExplosions(deltaSeconds);
        this.destroyTimedOut(deltaSeconds);
        this.updateJamLevels(deltaSeconds);
        this.calcHomingProjectiles(deltaSeconds);
        // both act once per call regardless of elapsed time (a proximity check, a per-tick
        // damage/impulse resolution), so unlike the rest of this method they don't freeze on
        // their own at deltaSeconds 0 (paused) and must be gated explicitly
        if (deltaSeconds > 0) {
            this.checkUnguidedProximityFuzes();
        }
        this.untrackDestroyedObjects();
        this.frozendAndAttachedDontMove();
        this.applyPhysics(deltaSeconds);
        // consume the fields-of-view as computed for this tick BEFORE marking them dirty below,
        // so the lazy FOV cache stays dirty for ship managers to recompute against fresh positions
        this.factionIntel.update(totalSeconds, deltaSeconds, this.getScanBeamCoveredByFaction());
        this.updateFieldsOFView();
        this.updateCollisionBodies();
        if (deltaSeconds > 0) {
            this.handleCollisions(deltaSeconds);
            this.applyHazardClouds(deltaSeconds);
        }
        this.secondsSinceLastGC += deltaSeconds;
        if (this.secondsSinceLastGC > GC_TIMEOUT) {
            this.gc();
        }
    }

    /**
     * The objects each faction holds under a scan beam, indexed by faction: in the field of view of
     * one of its objects and inside one of that object's scan-beam sectors. Own-faction objects are
     * always included. This is what keeps a FULL scan held (M4.19).
     */
    public getScanBeamCoveredByFaction(): ReadonlyArray<ReadonlySet<SpaceObject>> {
        const byFaction: Set<SpaceObject>[] = [];
        for (let faction = 0; faction < Number(Faction.FACTION_COUNT); faction++) {
            byFaction.push(new Set<SpaceObject>());
        }
        for (const object of this.state) {
            const covered = byFaction[Number(object.faction)];
            if (!covered) {
                continue; // object belongs to no faction (Faction.NONE = -1)
            }
            covered.add(object);
            const beams = [...object.radarSectors].filter((sector) => sector.isScanBeam);
            const data = this.stateToExtraData.get(object);
            if (!beams.length || !data) {
                continue;
            }
            for (const { object: target } of data.fov.view) {
                if (!target || isSensorInvisible(target) || covered.has(target)) {
                    continue;
                }
                const diff = XY.difference(target.position, object.position);
                const distance = XY.lengthOf(diff);
                const bearing = XY.angleOf(diff);
                if (beams.some((sector) => sectorCovers(sector, bearing, distance, target.radius))) {
                    covered.add(target);
                }
            }
        }
        return byFaction;
    }

    /**
     * Whether any object of the faction holds the target in its field of view (own-faction objects
     * always count). Same answer as getFactionVisibleObjects(faction).has(target), without building the set.
     */
    public isVisibleToFaction(faction: Faction, targetId: string): boolean {
        const [target] = this.getObjectPtr(targetId);
        if (!target) {
            return false;
        }
        if (target.faction === faction) {
            return true;
        }
        if (isSensorInvisible(target)) {
            return false;
        }
        for (const object of this.state) {
            if (object.faction === faction) {
                const data = this.stateToExtraData.get(object);
                if (data) {
                    for (const visibleArc of data.fov.view) {
                        if (visibleArc.object === target) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    public getFactionVisibleObjects(faction: Faction) {
        const visibleObjects = new Set<SpaceObject>();
        for (const object of this.state) {
            if (object.faction === faction) {
                visibleObjects.add(object);
                const data = this.stateToExtraData.get(object);
                if (data) {
                    for (const visibleArc of data.fov.view) {
                        visibleArc.object &&
                            !isSensorInvisible(visibleArc.object) &&
                            visibleObjects.add(visibleArc.object);
                    }
                } else {
                    logError(`object leak! ${object.id} has no extra data`);
                }
            }
        }
        return visibleObjects;
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
        for (const shell of this.state.getAll('Projectile')) {
            if (!shell.freeze) {
                shell.secondsToLive -= deltaSeconds;
                if (!shell.armed) {
                    shell.armingSeconds -= deltaSeconds;
                }
                if (shell.secondsToLive <= 0) {
                    if (shell.fuze.type === 'proximity') {
                        this.explodeProjectile(shell);
                    } else {
                        // contact fuze never got its hit — expires as a dud
                        shell.destroyed = true;
                    }
                }
            }
        }
    }

    // unguided rounds don't track a target, but a proximity fuze still detonates
    // them when a hostile object passes within range as they fly by. IFF-gated: a
    // wingman flying in formation with the shooter must not arm the fuze early, or a
    // multi-ship attack detonates every burst on its own formation before it ever
    // reaches the actual (more distant) target (issue #2082's wave-defence case).
    private checkUnguidedProximityFuzes() {
        for (const projectile of this.state.getAll('Projectile')) {
            if (projectile.freeze || projectile.design.homing) {
                continue;
            }
            const fuze = projectile.fuze;
            if (fuze.type !== 'proximity') {
                continue;
            }
            const shooter = this.state.get(projectile.shipId);
            const shooterFaction = shooter && Spaceship.isInstance(shooter) ? shooter.faction : null;
            const queryArea = new Circle(XY.clone(projectile.position), fuze.range);
            for (const object of this.spatialIndex.selectPotentials(queryArea)) {
                if (
                    (Spaceship.isInstance(object) || Asteroid.isInstance(object)) &&
                    !object.destroyed &&
                    object.id !== projectile.shipId && // never detonate on the ship that fired it
                    !(
                        Spaceship.isInstance(object) &&
                        shooterFaction !== null &&
                        shooterFaction !== Faction.NONE &&
                        object.faction === shooterFaction
                    ) // ...or on a friendly ship
                ) {
                    this.explodeProjectile(projectile);
                    break;
                }
            }
        }
    }

    /** Marks a missile as covered by a jamming scan beam for the current tick (M4.27 ruling). */
    public coverWithJamBeam(missile: Projectile) {
        this.jamCoveredMissileIds.add(missile.id);
    }

    /**
     * Moves each unjammed missile's `jamLevel` by `deltaSeconds / jamSeconds`: up while a jamming
     * beam covered it this tick, down otherwise. At 1 the missile is jammed (M4.27 ruling): it
     * permanently loses its target and its affiliation, keeping its faction and owner ship, and
     * flies on until a solid object enters its `jamLockRange`.
     */
    private updateJamLevels(deltaSeconds: number) {
        if (deltaSeconds <= 0) {
            return;
        }
        for (const missile of this.state.getAll('Projectile')) {
            if (missile.jammed || (missile.jamLevel <= 0 && !this.jamCoveredMissileIds.has(missile.id))) {
                continue;
            }
            const step = deltaSeconds / missile.jamSeconds;
            const covered = this.jamCoveredMissileIds.has(missile.id);
            missile.jamLevel = Math.min(1, Math.max(0, missile.jamLevel + (covered ? step : -step)));
            if (missile.jamLevel >= 1) {
                missile.jammed = true;
                missile.targetId = null;
            }
        }
        this.jamCoveredMissileIds.clear();
    }

    /**
     * A jammed missile with no live target locks onto the nearest solid object within its
     * `jamLockRange` — friend or foe, anything but its own launcher, which it can never hit.
     */
    private lockJammedMissile(missile: Projectile) {
        if (missile.targetId && this.state.get(missile.targetId)?.destroyed === false) {
            return;
        }
        missile.targetId = null;
        let nearest: SpaceObject | null = null;
        let nearestDistance = Infinity;
        const queryArea = new Circle(XY.clone(missile.position), missile.jamLockRange);
        for (const object of this.spatialIndex.selectPotentials(queryArea)) {
            if (
                (Spaceship.isInstance(object) || Asteroid.isInstance(object) || Derelict.isInstance(object)) &&
                !object.destroyed &&
                object.id !== missile.shipId
            ) {
                const distance = XY.distance(object.position, missile.position) - object.radius;
                if (distance <= missile.jamLockRange && distance < nearestDistance) {
                    nearest = object;
                    nearestDistance = distance;
                }
            }
        }
        if (nearest) {
            missile.targetId = nearest.id;
        }
    }

    /** FULL scan by the firing faction extends the sprint range, wherever the target sits in the beam */
    private sprintRange(sprint: { range: number; fullScanRange: number }, projectile: Projectile, target: SpaceObject) {
        const shooter = this.state.get(projectile.shipId);
        const faction = shooter ? Number(shooter.faction) : Number(Faction.NONE);
        return faction >= 0 && target.scanLevels[faction] === Number(ScanLevel.FULL)
            ? sprint.fullScanRange
            : sprint.range;
    }

    private calcHomingProjectiles(deltaSeconds: number) {
        for (const projectile of this.state.getAll('Projectile')) {
            if (projectile.jammed && !projectile.freeze && projectile.armed) {
                this.lockJammedMissile(projectile);
            }
            if (!projectile.freeze && projectile.armed && projectile.design.homing && projectile.targetId) {
                const [target] = this.getObjectPtr(projectile.targetId);
                if (target) {
                    const distanceToTarget = XY.distance(target.position, projectile.position) - target.radius;
                    const fuze = projectile.fuze;
                    if (fuze.type === 'proximity' && distanceToTarget < fuze.range) {
                        this.explodeProjectile(projectile);
                    } else {
                        const homing = projectile.design.homing;
                        // lead at sprint speed: that's what it closes at once sprinting.
                        // see: docs/SUBSYSTEMS.md#homing-missile-guidance
                        const leadSpeed = homing.sprint
                            ? homing.maxSpeed * homing.sprint.speedMultiplier
                            : homing.maxSpeed;
                        const intercept = predictInterceptPoint(projectile.position, leadSpeed, target);
                        const avoidance = avoidObstacles(
                            projectile,
                            intercept,
                            XY.lengthOf(projectile.velocity),
                            this.spatialIndex,
                            [projectile.id, projectile.shipId, target.id],
                        );
                        // At top speed, thrust along a hull a few degrees off the velocity barely turns
                        // the velocity. While dodging, over-rotate by the velocity's own error so the
                        // thrust has a real sideways component.
                        const destination =
                            avoidance === intercept
                                ? intercept
                                : overSteer(projectile.position, projectile.velocity, avoidance);
                        const relativeDestination = XY.difference(destination, projectile.position);
                        const velocityDestinationDiff = toDegreesDelta(
                            XY.angleOf(relativeDestination) - XY.angleOf(projectile.velocity),
                        );
                        const sprintMultiplier =
                            homing.sprint && distanceToTarget < this.sprintRange(homing.sprint, projectile, target)
                                ? homing.sprint.speedMultiplier
                                : 1;

                        const maxSpeed = homing.maxSpeed * sprintMultiplier;
                        let rotation = 0;
                        let boost = 0;
                        if (sprintMultiplier > 1) {
                            // sprint agility grows with sprint speed: thrust authority across the lead
                            // line cancels the velocity's sideways error at once, rather than waiting on
                            // a hull turn whose radius grows with speed squared. Along the line the
                            // missile thrusts along its nose as usual.
                            const lineDirection = XY.normalize(relativeDestination);
                            const sideways = XY.difference(
                                projectile.velocity,
                                XY.scale(lineDirection, XY.dot(projectile.velocity, lineDirection)),
                            );
                            const authority = deltaSeconds * homing.velocityCapacity * sprintMultiplier;
                            projectile.velocity.add(
                                XY.negate(
                                    XY.lengthOf(sideways) > authority
                                        ? XY.byLengthAndDirection(authority, XY.angleOf(sideways))
                                        : sideways,
                                ),
                            );
                            rotation = rotateToTarget(deltaSeconds, projectile, destination, 0) * sprintMultiplier;
                            boost = moveToTarget(deltaSeconds, projectile, destination).boost;
                        } else if (Math.abs(velocityDestinationDiff) > 45 && Math.abs(velocityDestinationDiff) < 135) {
                            // velocity is sideways from angle, make a sharp turn againt it
                            rotation = rotateToTarget(
                                deltaSeconds,
                                projectile,
                                XY.add(projectile.position, XY.scale(projectile.velocity, -10)),
                                0,
                            );
                            boost = 1;
                        } else {
                            rotation = rotateToTarget(deltaSeconds, projectile, destination, 0);
                            boost = moveToTarget(deltaSeconds, projectile, destination).boost;
                        }

                        projectile.turnSpeed += rotation * deltaSeconds * projectile.rotationCapacity;
                        if (boost > 0) {
                            const desiredSpeed = XY.byLengthAndDirection(
                                boost * deltaSeconds * homing.velocityCapacity * sprintMultiplier,
                                projectile.angle,
                            );
                            projectile.velocity.add(desiredSpeed);
                        }
                        if (XY.lengthOf(projectile.velocity) > maxSpeed) {
                            projectile.velocity.normalize(maxSpeed);
                        }
                    }
                }
            }
        }
    }

    private untrackDestroyedObjects() {
        for (const destroyed of this.state[Symbol.iterator](true)) {
            const data = this.stateToExtraData.get(destroyed);
            if (data) {
                this.stateToExtraData.delete(destroyed);
                this.collisionToState.delete(data.body);
                this.collisions.remove(data.body);
                this.attachments.delete(destroyed.id);
            }
        }
        for (const body of this.cleanupBodies) {
            this.collisions.remove(body);
        }
        this.cleanupBodies.length = 0;
    }

    public checkDuplicateShip(shipId: string) {
        return this.state.getShip(shipId) || this.toInsert.find(({ id }) => id === shipId);
    }

    public insert(object: SpaceObject) {
        this.toInsert.push(object);
    }

    public insertBulk(objects: Iterable<SpaceObject>) {
        this.toInsert.push(...objects);
    }

    public forceFlushEntities() {
        this.handleToInsert();
    }

    public attach(attacherId: string, attacheeId: string) {
        this.attachments.set(attacherId, attacheeId);
    }

    public detach(attacherId: string) {
        const clique = this.attachmentCliques.get(attacherId);
        if (clique) {
            const [subject] = this.getObjectPtr(attacherId);
            if (subject) {
                let velocity = XY.zero;
                let turnSpeed = 0;
                for (const obj of clique) {
                    velocity = XY.add(velocity, obj.velocity);
                    turnSpeed += obj.turnSpeed;
                }
                subject.velocity.setValue(velocity);
                subject.turnSpeed = turnSpeed;
            }
        }
        this.attachments.delete(attacherId);
    }

    private handleToInsert() {
        if (this.toInsert.length) {
            this.gc();
            for (const object of this.toInsert) {
                this.state.set(object);
                const body = this.collisions.createCircle(XY.clone(object.position), object.radius);
                this.collisionToState.set(body, object);
                const fov = new FieldOfView(this.spatialIndex, object);
                this.stateToExtraData.set(object, { body, fov });
            }
            this.toInsert = [];
        }
    }

    private frozendAndAttachedDontMove() {
        for (const object of this.state) {
            if (object.freeze || this.attachments.get(object.id)) {
                object.velocity.x = object.velocity.y = object.turnSpeed = 0;
            }
            const data = this.stateToExtraData.get(object);
            if (data) {
                data.body.isStatic = object.freeze;
            }
        }
    }

    private isSweepTarget = (potential: Body) => {
        const object = this.collisionToState.get(potential as Circle);
        const ignore = !object || this.isProjectile(object) || HazardCloud.isInstance(object);
        return !ignore;
    };

    /**
     * Swept contact for every moving projectile, before anything moves this tick: the first solid it
     * touches (hull plus projectile radius) with both on their velocities, and where the projectile sits
     * relative to it at that moment. Solving in the other object's frame catches a target that crosses
     * the projectile's path during the tick, which a ray against the target's start position misses.
     */
    private sweepProjectiles(deltaSeconds: number) {
        const contacts = new Map<SpaceObject, { other: SpaceObject; offset: XY }>();
        for (const projectile of this.state.getAll('Projectile')) {
            if (projectile.freeze || XY.isZero(projectile.velocity, ZERO_VELOCITY_THRESHOLD)) {
                continue;
            }
            const travel = XY.scale(projectile.velocity, deltaSeconds);
            const reach = XY.lengthOf(travel) / 2 + ABSOLUTE_MAX_SPEED * deltaSeconds + projectile.radius;
            const queryArea = new Circle(XY.add(projectile.position, XY.scale(travel, 0.5)), reach);
            let earliest: { other: SpaceObject; time: number } | null = null;
            for (const other of this.spatialIndex.selectPotentials(queryArea)) {
                const data = this.stateToExtraData.get(other);
                if (
                    other === projectile ||
                    !data ||
                    !this.isSweepTarget(data.body) ||
                    this.isOwnFire(projectile, other)
                ) {
                    continue;
                }
                const time = firstContactSeconds(projectile, other, other.radius + projectile.radius, deltaSeconds);
                if (time !== null && (!earliest || time < earliest.time)) {
                    earliest = { other, time };
                }
            }
            if (earliest) {
                const offset = XY.difference(
                    addScale(projectile.position, projectile.velocity, earliest.time),
                    addScale(earliest.other.position, earliest.other.velocity, earliest.time),
                );
                contacts.set(projectile, { other: earliest.other, offset });
            }
        }
        return contacts;
    }

    private applyPhysics(deltaSeconds: number) {
        const contacts = this.sweepProjectiles(deltaSeconds);
        // loop over objects and apply velocity
        for (const subject of this.state) {
            if (!XY.isZero(subject.velocity, ZERO_VELOCITY_THRESHOLD)) {
                const positionDelta = XY.scale(subject.velocity, deltaSeconds);
                for (const obj of this.attachmentCliques.get(subject.id) || [subject]) {
                    obj.position.setValue(XY.add(obj.position, positionDelta));
                    this.toUpdateCollisions.add(obj);
                }
            }
            if (subject.turnSpeed) {
                const angleDelta = subject.turnSpeed * deltaSeconds;
                for (const obj of this.attachmentCliques.get(subject.id) || [subject]) {
                    obj.angle = toPositiveDegreesDelta(obj.angle + angleDelta);
                    if (subject !== obj) {
                        const destination = XY.add(
                            XY.rotate(XY.difference(obj.position, subject.position), angleDelta),
                            subject.position,
                        );
                        obj.position.setValue(destination);
                        this.toUpdateCollisions.add(obj);
                    }
                }
            }
        }
        // a projectile that touched something this tick ends it in contact, where the collision pass
        // resolves its fuze
        for (const [projectile, { other, offset }] of contacts) {
            // a hair inside the contact distance, so the collision pass sees an overlap
            projectile.position.setValue(XY.add(other.position, XY.scale(offset, 1 - EPSILON)));
        }
    }

    private explodeProjectile(projectile: Projectile) {
        projectile.destroyed = true;
        const explosion = projectile.makeExplosion();
        explosion.init(uniqueId('explosion'), projectile.position.clone(), explosion.damageFactor);
        explosion.shipId = projectile.shipId;
        explosion.velocity = Vec2.make(XY.scale(projectile.velocity, explosion.velocityInheritance));
        this.clampToAbsoluteMaxSpeed(explosion);
        this.insert(explosion);
    }

    // contact-fuzed warhead: exactly one damage event at the point of impact, no explosion object
    private resolveProjectileContactDamage(projectile: Projectile, hit: SpaceObject, deltaSeconds: number) {
        projectile.destroyed = true;
        const warhead = projectile.design;
        if (warhead.delivery !== 'impact') {
            return;
        }
        const flatDamage = warhead.damage;
        if (Spaceship.isInstance(hit)) {
            // impact is a single point: the bearing from the hull centre to the projectile centre.
            // arc gets a minimal width so it lands on the one plate facing the hit (a zero-width
            // arc is rejected by archIntersection).
            const impactAngle = limitPercision(
                XY.angleOf(hit.globalToLocal(XY.difference(projectile.position, hit.position))),
            );
            const damage: Damage = {
                id: projectile.id,
                amount: flatDamage,
                damageSurfaceArc: [impactAngle, limitPercision(impactAngle + EPSILON)],
                damageDurationSeconds: deltaSeconds,
                damageType: projectile.damageType,
                delivery: 'impact',
                shipId: projectile.shipId,
                concentration: warhead.concentration,
            };
            const objectDamage = this.objectDamage.get(hit.id);
            if (objectDamage === undefined) {
                this.objectDamage.set(hit.id, [damage]);
            } else {
                objectDamage.push(damage);
            }
        } else if (Asteroid.isInstance(hit)) {
            hit.health -= flatDamage;
        }
    }

    public *resolveObjectDamage(id: string): IterableIterator<Damage> {
        const damageArr = this.objectDamage.get(id);
        if (damageArr !== undefined) {
            yield* damageArr;
            this.objectDamage.delete(id);
        }
    }

    public changeShipRadarSectors(id: string, sectors: readonly RadarSectorValues[]) {
        const ship = this.state.getShip(id);
        if (ship && !ship.destroyed) {
            applyRadarSectors(ship.radarSectors, sectors);
        }
    }

    public resolveObjectOrder(id: string) {
        const order = this.objectOrder.get(id);
        this.objectOrder.delete(id);
        return order || null;
    }

    private isProjectile = (o: SpaceObject) =>
        Projectile.isInstance(o) || (Explosion.isInstance(o) && XY.isZero(o.velocity, o.radius));

    private handleCollisions(deltaSeconds: number) {
        const positionChanges: Array<{ s: SpaceObject; p: XY }> = [];
        // find and handle collisions
        this.collisions.checkAll((response: SWResponse) => {
            const subject = this.collisionToState.get(response.a);
            const object = this.collisionToState.get(response.b);
            if (
                subject &&
                !subject.destroyed &&
                !subject.freeze &&
                object &&
                !Projectile.isInstance(object) &&
                !Waypoint.isInstance(subject) &&
                !Waypoint.isInstance(object) &&
                !Nebula.isInstance(subject) &&
                !Nebula.isInstance(object) &&
                !HazardCloud.isInstance(subject) &&
                !HazardCloud.isInstance(object) &&
                !object.destroyed
            ) {
                let positionChange: XY | null = null;
                if (this.isOwnFire(subject, object)) {
                    // a ship's own projectiles and blasts never damage or push it (issue #2345)
                } else if (Projectile.isInstance(subject)) {
                    if (!subject.armed) {
                        // an unarmed missile (issue #2342) is an inert body: no fuze, no warhead
                        return;
                    }
                    // A proximity fuze reacts to solid contacts, not to blast clouds. Without this
                    // guard, a sustained cannonade leaves a trail of still-expanding Explosion
                    // bodies along the firing line; a later shell physically collides with that
                    // trail and self-detonates short of its real target. Each shot then detonates
                    // a little earlier than the last, walking the blast back toward the shooter
                    // until one overlaps the shooter itself and its impulse flings it out of range
                    // (issue #2108).
                    if (subject.fuze.type === 'proximity' && !Explosion.isInstance(object)) {
                        this.explodeProjectile(subject);
                    } else if (subject.fuze.type !== 'proximity') {
                        this.resolveProjectileContactDamage(subject, object, deltaSeconds);
                    }
                } else if (Explosion.isInstance(subject)) {
                    positionChange = this.handleExplosionCollision();
                } else {
                    const res = this.calcSolidCollision(deltaSeconds, subject, object, response);
                    positionChange = res.positionChange;
                    Vec2.add(subject.velocity, res.velocityChange, subject.velocity);
                    this.clampToAbsoluteMaxSpeed(subject);
                    if (res.damageAmount > 0) {
                        if (Spaceship.isInstance(subject)) {
                            this.handleShipCollisionDamage(deltaSeconds, res.damageAmount, subject, object, response);
                        } else if (Asteroid.isInstance(subject)) {
                            subject.health -= res.damageAmount;
                        }
                    }
                }
                if (positionChange) {
                    positionChanges.push({ s: subject, p: positionChange });
                }
            }
        });
        for (const { s, p } of positionChanges) {
            for (const obj of this.attachmentCliques.get(s.id) || [s]) {
                Vec2.add(obj.position, p, obj.position);
                this.toUpdateCollisions.add(obj);
            }
        }
    }
    /**
     * Hazard cloud effects (M4.40): projectiles inside wear down (extra lifetime burned) and are
     * destroyed without detonating once worn out; ships inside take hull damage that scales with
     * speed above the cloud's safe speed, on the plates facing their direction of travel.
     */
    private applyHazardClouds(deltaSeconds: number) {
        for (const cloud of this.state.getAll('HazardCloud')) {
            const body = this.stateToExtraData.get(cloud)?.body;
            if (!body) {
                continue;
            }
            for (const potential of this.collisions.getPotentials(body)) {
                const object = this.collisionToState.get(potential);
                if (
                    !object ||
                    object.destroyed ||
                    XY.distance(object.position, cloud.position) > cloud.radius + object.radius
                ) {
                    continue;
                }
                if (Projectile.isInstance(object)) {
                    object.secondsToLive -= cloud.projectileAttritionRate * deltaSeconds;
                    if (object.secondsToLive <= 0) {
                        object.destroyed = true;
                    }
                } else if (Spaceship.isInstance(object)) {
                    const excessSpeed = XY.lengthOf(object.velocity) - cloud.safeSpeed;
                    if (excessSpeed <= 0) {
                        continue;
                    }
                    const heading = XY.angleOf(object.globalToLocal(object.velocity));
                    const damage: Damage = {
                        id: cloud.id,
                        amount: cloud.hullDamagePerSpeed * excessSpeed * deltaSeconds,
                        damageSurfaceArc: [limitPercision(heading - 45), limitPercision(heading + 45)],
                        damageDurationSeconds: deltaSeconds,
                        damageType: 'Collision',
                        delivery: 'impact',
                        shipId: '',
                    };
                    const objectDamage = this.objectDamage.get(object.id);
                    if (objectDamage === undefined) {
                        this.objectDamage.set(object.id, [damage]);
                    } else {
                        objectDamage.push(damage);
                    }
                }
            }
        }
    }

    private isOwnFire(subject: SpaceObject, object: SpaceObject) {
        return (
            (Projectile.isInstance(subject) && subject.shipId !== '' && subject.shipId === object.id) ||
            (Explosion.isInstance(object) && object.shipId !== '' && object.shipId === subject.id)
        );
    }

    /**
     * An explosion is a region of space, not a body — it has no momentum to trade. Colliding
     * with it affects the object it strikes (see calcSolidCollision's Explosion branch); the
     * blast's own position and velocity are never mutated by collision response. This is about
     * collision response only — velocity inherited at spawn (explodeProjectile) is untouched.
     */
    private handleExplosionCollision(): XY | null {
        return null;
    }

    private calcSolidCollision(
        deltaSeconds: number,
        subject: Exclude<SpaceObject, Projectile | Explosion>,
        object: SpaceObject,
        response: SWResponse,
    ) {
        if (Explosion.isInstance(object)) {
            const exposure = deltaSeconds * Math.min(response.overlap, object.radius * 2);
            // Treat mass as proportional to radius^3: a blast's momentum transfer accelerates a
            // heavier (larger) hull proportionally less, same as a real explosion barely budging
            // a much bigger mass. Damage is untouched -- only the physical pushback scales down
            // (issue #2092 design redirect).
            const massScale = (BLAST_IMPULSE_MASS_REFERENCE_RADIUS / subject.radius) ** 3;
            // A warhead detonates once against a given target: damageFactor is the blast's flat,
            // bounded per-detonation figure, not a per-second rate to integrate over however long
            // the (possibly still-moving, still-growing) cloud happens to overlap the hull -- that
            // integral made the outcome a function of shell speed and target diameter instead of
            // the warhead (issue #2236). The impulse below is unrelated physical pushback and
            // keeps accruing every tick of physical overlap, same as before.
            const alreadyDetonatedOnTarget = object.hitObjectIds.has(subject.id);
            if (!alreadyDetonatedOnTarget) {
                object.hitObjectIds.add(subject.id);
            }
            return {
                damageAmount: alreadyDetonatedOnTarget ? 0 : object.damageFactor,
                positionChange: null,
                velocityChange: XY.scale(response.overlapV, -exposure * object.blastFactor * massScale),
            };
        } else {
            const collisionVector = XY.scale(response.overlapV, -0.5);
            return {
                damageAmount: subject.collisionDamage * deltaSeconds * Math.min(response.overlap, object.radius * 2),
                positionChange: collisionVector,
                velocityChange: XY.scale(collisionVector, subject.collisionElasticity / deltaSeconds),
            };
        }
    }

    /**
     * The footprint used to size a hit's damage arc. An explosion detonates once per target
     * (see calcSolidCollision), on whichever tick collision detection first notices the overlap
     * -- which can be well before the blast has finished growing. The warhead's actual reach is
     * its fully-grown radius (current radius plus whatever it still gains over its remaining
     * lifetime), not however far it happened to have expanded by that tick, so the one detonation
     * event is sized off the former (issue #2236). Every other collider uses its live geometry.
     */
    private damageFootprint(object: SpaceObject) {
        if (Explosion.isInstance(object)) {
            return {
                position: object.position,
                radius: object.radius + object.expansionSpeed * object.secondsToLive,
            };
        }
        return object;
    }

    private handleShipCollisionDamage(
        deltaSeconds: number,
        damageAmount: number,
        subject: Spaceship,
        object: SpaceObject,
        response: SWResponse,
    ) {
        const damageBoundries = circlesIntersection(subject, this.damageFootprint(object));
        if (damageBoundries) {
            const shipLocalDamageBoundries: [XY, XY] = [
                subject.globalToLocal(XY.difference(damageBoundries[0], subject.position)),
                subject.globalToLocal(XY.difference(damageBoundries[1], subject.position)),
            ];
            const shipLocalDamageAngles: Tuple2 = [
                limitPercision(XY.angleOf(shipLocalDamageBoundries[0])),
                limitPercision(XY.angleOf(shipLocalDamageBoundries[1])),
            ];
            const damage: Damage = {
                id: object.id,
                amount: damageAmount,
                damageSurfaceArc: shipLocalDamageAngles,
                damageDurationSeconds: deltaSeconds,
                damageType: object.damageType,
                delivery: Explosion.isInstance(object) ? 'explosion' : 'impact',
                shipId: Explosion.isInstance(object) ? object.shipId : '',
                concentration: Explosion.isInstance(object) ? object.concentration : 1,
            };
            const objectDamage = this.objectDamage.get(subject.id);
            if (objectDamage === undefined) {
                this.objectDamage.set(subject.id, [damage]);
            } else {
                objectDamage.push(damage);
            }
        } else {
            logError(
                `unexpected undefined intersection with Spaceship.\n${collisionErrorMsg(object, subject, response)}`,
            );
        }
    }

    private updateFieldsOFView() {
        for (const object of this.state) {
            const data = this.stateToExtraData.get(object);
            if (data) {
                data.fov.setDirty();
            } else {
                logError(`object leak! ${object.id} has no extra data`);
            }
        }
    }

    private updateCollisionBodies() {
        for (const object of this.toUpdateCollisions) {
            if (!object.destroyed) {
                const data = this.stateToExtraData.get(object);
                if (data) {
                    data.body.r = object.radius;
                    data.body.setPosition(object.position.x, object.position.y); // order matters! setPosition() internally calls updateAABB()
                } else {
                    logError(`object leak! ${object.id} has no extra data`);
                }
            }
        }
        this.collisions.update();
        // reset toUpdateCollisions
        this.toUpdateCollisions.clear();
    }

    /**
     * Whether the scanner currently holds the target in its field of view: inside a radar sector,
     * within that sector's reach, and not hidden behind a nearer object.
     */
    public isVisible(scannerId: string, targetId: string): boolean {
        const [scanner] = this.getObjectPtr(scannerId);
        const [target] = this.getObjectPtr(targetId);

        if (!scanner || !target || isSensorInvisible(target)) {
            return false;
        }

        // Check line-of-sight via field-of-view
        const scannerData = this.stateToExtraData.get(scanner);
        if (!scannerData) {
            return false;
        }

        // Check if target is visible in scanner's FOV
        for (const visibleArc of scannerData.fov.view) {
            if (visibleArc.object === target) {
                return true;
            }
        }

        return false;
    }
}

function collisionErrorMsg(object: SpaceObject, subject: SpaceObject, response: SWResponse) {
    return `Subject ${subject.type} data: centre: ${JSON.stringify(subject.position)}(${JSON.stringify(
        response.a.pos,
    )}) radius: ${JSON.stringify(subject.radius)}\n Object ${object.type} data: centre: ${JSON.stringify(
        object.position,
    )}(${JSON.stringify(response.b.pos)}) radius: ${JSON.stringify(object.radius)}. state distance: ${XY.lengthOf(
        XY.difference(subject.position, object.position),
    )}. collision distance: ${XY.distance(response.a.pos, response.b.pos)}`;
}

/** Most an over-steer aims past its waypoint. */
const MAX_OVERSTEER_DEGREES = 45;

/**
 * A point as far as `waypoint`, on a bearing past it by the velocity's heading error toward it, at
 * most {@link MAX_OVERSTEER_DEGREES}, and short of 180 degrees from the heading: past that the
 * shortest turn to the aim would swing away from the waypoint.
 */
export function overSteer(position: XY, velocity: XY, waypoint: XY): XY {
    const toWaypoint = XY.difference(waypoint, position);
    const desired = XY.angleOf(toWaypoint);
    const error = toDegreesDelta(desired - XY.angleOf(velocity));
    const overshoot = Math.sign(error) * Math.min(Math.abs(error), MAX_OVERSTEER_DEGREES, (180 - Math.abs(error)) / 2);
    return XY.add(position, XY.byLengthAndDirection(XY.lengthOf(toWaypoint), desired + overshoot));
}

/**
 * Seconds into the next `seconds` at which `mover` first comes within `contactDistance` of `other`'s
 * centre, both on their current velocities; null when it doesn't.
 */
function firstContactSeconds(mover: SpaceObject, other: SpaceObject, contactDistance: number, seconds: number) {
    const relativePosition = XY.difference(mover.position, other.position);
    const relativeVelocity = XY.difference(mover.velocity, other.velocity);
    const c = XY.dot(relativePosition, relativePosition) - contactDistance * contactDistance;
    if (c <= 0) {
        return null; // already touching: the collision pass has it
    }
    const a = XY.dot(relativeVelocity, relativeVelocity);
    const b = 2 * XY.dot(relativePosition, relativeVelocity);
    const discriminant = b * b - 4 * a * c;
    if (a === 0 || b >= 0 || discriminant < 0) {
        return null;
    }
    const time = (-b - Math.sqrt(discriminant)) / (2 * a);
    return time <= seconds ? time : null;
}
