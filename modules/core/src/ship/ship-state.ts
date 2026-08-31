import { ArraySchema, Schema } from '@colyseus/schema';
import { Faction, Spaceship, Vec2 } from '../space';
import { LockPropertyArg, Lockable } from '../lock-commands';
import { ShipArea, XY, capToRange, notNull, toDegreesDelta } from '..';
import { commandable, gameField } from '../game-field';
import { range, rangeSchema } from '../range';

import { Armor } from './armor';
import { ChainGun } from './chain-gun';
import { DesignState } from './system';
import { Docking } from './docking';
import { FlightDoctrine } from './flight-doctrine';
import { Magazine } from './magazine';
import { Maneuvering } from './maneuvering';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { RepairQueue } from './repair-queue';
import { ShipDirection } from './ship-direction';
import { Signals } from './signals';
import { SmartPilot } from './smart-pilot';
import { Targeting } from './targeting';
import { Thruster } from './thruster';
import { Tube } from './tube';
import { Warp } from './warp';
import { tweakable } from '../tweakable';

export enum TargetedStatus {
    NONE,
    LOCKED,
    FIRED_UPON,
}

export enum IdleStrategy {
    /** Hold fire — the only idle strategy that suppresses default NPC gunnery. */
    PLAY_DEAD,
    /**
     * Fires on hostiles like every other idle strategy. Wandering movement is not yet
     * implemented, so this currently behaves exactly like {@link STAND_GROUND}.
     */
    ROAM,
    /** Fires on hostiles; never moves (no movement order is ever attached to this strategy). */
    STAND_GROUND,
}

export enum Order {
    NONE,
    MOVE,
    ATTACK,
    FOLLOW,
}

/**
 * A ship's doctrine when it hasn't been given an explicit `flightDoctrine` override.
 *
 * MOVE uses INTERCEPT because its only use of the profile is `goto()`'s transit concession, which
 * exists to trade route efficiency for a firing solution and is already bounded by
 * `MAX_TRANSIT_HEADING_CONCESSION`. STANDOFF's `aim` 0.4 wins there only where the route heading's
 * own thrust penalty exceeds it — never, on a transit flying its best axis.
 */
export function doctrineForOrder(order: Order): Exclude<FlightDoctrine, FlightDoctrine.AUTO> {
    switch (order) {
        case Order.FOLLOW:
            return FlightDoctrine.SHADOW;
        case Order.MOVE:
            return FlightDoctrine.INTERCEPT;
        case Order.ATTACK:
        case Order.NONE:
            return FlightDoctrine.STANDOFF;
    }
}

export type ShipPropertiesDesign = {
    modelName?: string;
    totalCoolant: number;
    systemKillRatio: number; // ratio of broken systems to cause ship death. <=0 means death on first hit, >1 means can't be killed
};

export class ShipPropertiesDesignState extends DesignState implements ShipPropertiesDesign {
    @gameField('float32') totalCoolant = 0;
    @gameField('float32') systemKillRatio = 0;
}
@rangeSchema({ '/spaceship/turnSpeed': [-90, 90] })
export class ShipState extends Schema implements Lockable {
    /**
     * Composed space object - a mirror of the authoritative Spaceship in SpaceState,
     * updated every game tick by syncShipProperties(). This is NOT the source of truth
     * for physics properties; modify the SpaceObject in SpaceManager instead.
     */
    @gameField(Spaceship)
    spaceship: Spaceship = new Spaceship();

    @gameField('string')
    id = '';

    @gameField(ShipPropertiesDesignState)
    design = new ShipPropertiesDesignState();

    @gameField('boolean')
    isPlayerShip = true;

    /**
     * The fallback behind `order`: consulted only while `order === Order.NONE`. Defaults to
     * `PLAY_DEAD` (hold fire), so a map whose NPCs never receive an order (e.g. wave-defence's
     * stations) must set this explicitly to have them fire back.
     */
    @tweakable({ type: 'enum', enum: IdleStrategy })
    @gameField('int8')
    idleStrategy = IdleStrategy.PLAY_DEAD;

    @tweakable({ type: 'enum', enum: Order })
    @gameField('int8')
    order = Order.NONE;

    /**
     * How this ship weighs gunnery aim against propulsion efficiency when choosing hull heading and
     * standoff distance. `AUTO` (the default) defers to `order` via {@link doctrineForOrder};
     * override for a hull whose armament doesn't fit its order's default doctrine.
     */
    @tweakable({ type: 'enum', enum: FlightDoctrine })
    @gameField('int8')
    flightDoctrine = FlightDoctrine.AUTO;

    /** The doctrine actually flown: the explicit override if set, otherwise the one `order` implies. */
    get effectiveFlightDoctrine(): FlightDoctrine {
        return this.flightDoctrine === FlightDoctrine.AUTO ? doctrineForOrder(this.order) : this.flightDoctrine;
    }

    @tweakable('string')
    @gameField('string')
    orderTargetId: string | null = null;

    @gameField(Vec2)
    orderPosition = new Vec2();

    @gameField('string')
    currentTask = '';

    @gameField([Thruster])
    thrusters!: ArraySchema<Thruster>;

    @gameField([Tube])
    tubes = new ArraySchema<Tube>();

    @gameField([ChainGun])
    chainGuns = new ArraySchema<ChainGun>();

    @gameField([Radar])
    radars = new ArraySchema<Radar>();

    @gameField(Reactor)
    reactor!: Reactor;

    @gameField(SmartPilot)
    smartPilot!: SmartPilot;

    @gameField(Armor)
    armor!: Armor;

    @gameField(Magazine)
    magazine!: Magazine;

    @gameField(Targeting)
    weaponsTarget!: Targeting;

    @gameField(Warp)
    warp: Warp | null = null;

    @gameField(Docking)
    docking!: Docking;

    @gameField(Maneuvering)
    maneuvering!: Maneuvering;

    @gameField(Signals)
    signals!: Signals;

    @gameField(RepairQueue)
    repairQueue = new RepairQueue();

    /**
     * JSON Pointer paths (relative to this ship's state root) whose GM lock is
     * currently active — see `lock-commands.ts`. Synced so the GM tweak
     * panel's lock toggle reflects current state across reconnects/other GM
     * clients; the write guard itself lives in `lock-registry.ts`.
     */
    @gameField(['string'])
    lockedPaths = new ArraySchema<string>();

    @range([-1, 1])
    @gameField('float32')
    rotation = 0;

    @range([-1, 1])
    @gameField('float32')
    boost = 0;

    @range([-1, 1])
    @gameField('float32')
    strafe = 0;

    @range([0, 1])
    @commandable()
    @gameField('float32')
    antiDrift = 0;

    @range([0, 1])
    @commandable()
    @gameField('float32')
    breaks = 0;

    @range([0, 1])
    @gameField('float32')
    afterBurner = 0;

    @gameField('int8')
    targeted = TargetedStatus.NONE;

    /**
     * Hull damage state - 2-state flag (ok/damaged) for IoT alerts/lights control.
     * Controlled manually by GM in tweak panel. No game logic impact.
     */
    @tweakable('boolean')
    @gameField('boolean')
    hullDamaged = false;

    // server only, used for commands
    @commandable()
    @range([0, 1])
    public afterBurnerCommand = 0;
    @commandable()
    public rotationModeCommand = false;
    @commandable()
    public maneuveringModeCommand = false;
    @commandable()
    public fireTubesCommand = false;

    /** Drained by `applyLockCommands` (`lock-commands.ts`) each tick. */
    public lockCommands = Array.of<LockPropertyArg>();

    // Read-only delegates to the composed spaceship. These satisfy the Craft
    // interface used by helm-assist / gunner-assist without @gameField, so they
    // don't create Colyseus serialization conflicts.
    get position(): Vec2 {
        return this.spaceship.position;
    }
    get velocity(): Vec2 {
        return this.spaceship.velocity;
    }
    get angle(): number {
        return this.spaceship.angle;
    }
    get turnSpeed(): number {
        return this.spaceship.turnSpeed;
    }
    get faction(): Faction {
        return this.spaceship.faction;
    }
    get radius(): number {
        return this.spaceship.radius;
    }
    globalToLocal(global: XY) {
        return this.spaceship.globalToLocal(global);
    }
    localToGlobal(local: XY) {
        return this.spaceship.localToGlobal(local);
    }
    get directionAxis() {
        return this.spaceship.directionAxis;
    }

    @range([0, 360])
    get velocityAngle() {
        return XY.angleOf(this.spaceship.velocity);
    }
    @range((t: ShipState) => [0, t.maxMaxSpeed])
    get speed() {
        return XY.lengthOf(this.spaceship.velocity);
    }
    *angleThrusters(direction: ShipDirection) {
        for (const thruster of this.thrusters) {
            if (toDegreesDelta(direction) === toDegreesDelta(thruster.fittedBearing)) {
                yield thruster;
            }
        }
    }

    velocityCapacity(direction: ShipDirection) {
        return [...this.angleThrusters(direction)].reduce((s, t) => s + t.getVelocityCapacity(this), 0);
    }

    getMaxSpeedForAfterburner(afterBurner: number) {
        return this.smartPilot.design.maxSpeed + afterBurner * this.smartPilot.design.maxSpeedFromAfterBurner;
    }

    get maxSpeed() {
        return this.getMaxSpeedForAfterburner(this.afterBurner);
    }
    get maxMaxSpeed() {
        return this.getMaxSpeedForAfterburner(1);
    }

    get rotationCapacity() {
        return this.maneuvering.effectiveness * this.maneuvering.efficiency * this.maneuvering.design.rotationCapacity;
    }

    /**
     * Single 0..1 scalar summarising how much damage this ship can still absorb before it dies:
     * 1 is fully intact, 0 is exactly the `systemKillRatio` threshold `DamageManager.update()`
     * uses to convert an expendable ship to a derelict. Mirrors that threshold rather than
     * duplicating it, so the two can never drift apart.
     */
    @range([0, 1])
    get healthRatio(): number {
        const systems = this.systems();
        const killRatio = this.design.systemKillRatio;
        if (systems.length === 0 || killRatio <= 0) {
            return systems.some((s) => s.broken) ? 0 : 1;
        }
        const broken = systems.filter((s) => s.broken).length;
        return capToRange(0, 1, 1 - broken / (systems.length * killRatio));
    }

    systems() {
        return [...this.systemsByAreas(ShipArea.front), ...this.systemsByAreas(ShipArea.rear)];
    }

    systemsByAreas(area: ShipArea) {
        switch (area) {
            case ShipArea.front:
                return [
                    ...this.chainGuns.values(),
                    ...this.radars.values(),
                    this.smartPilot,
                    this.magazine,
                    this.warp,
                    this.docking,
                    this.signals,
                ].filter(notNull);
            case ShipArea.rear:
                return [this.reactor, this.maneuvering, ...this.thrusters.values(), ...this.tubes.values()].filter(
                    notNull,
                );
        }
        return [];
    }
}
