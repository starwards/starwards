import {
    AmmoType,
    Faction,
    Projectile,
    ScanLevel,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    ammoDesigns,
    applyRadarSectors,
    dragonflyMK1,
    dragonflyMK1Thruster,
    mulberry32,
    predictInterceptPoint,
} from '../src';

import { expect } from 'chai';
import { tick } from './tick';

// Terminal-phase hit rate: once a missile is at its sprint boundary, armed and on course, it must
// hit a maneuvering ship at least 85% of the time, whatever the ship does.
// see: docs/SUBSYSTEMS.md#homing-missile-guidance

const HZ = 20;
const DT = 1 / HZ;
const MAX_MISS_RATE = 0.15;
const RUNS_PER_CELL = 40; // x5 behaviours = 200 runs per missile design and start range
const BASE_RANGE = 3_000;
const FULL_SCAN_RANGE = 6_000;

// Target: the most agile hull, Dragonfly MK-I. One thruster per axis, capacity 300 plus 300
// afterburner, so 600 u/s^2 per axis; boosting and strafing together reach 600*sqrt(2).
// Top speed with full afterburner: maxSpeed + maxSpeedFromAfterBurner.
const TARGET_RADIUS = dragonflyMK1.radius;
const TARGET_MAX_SPEED = dragonflyMK1.smartPilot.maxSpeed + dragonflyMK1.smartPilot.maxSpeedFromAfterBurner;
const TARGET_MAX_ACCEL = (dragonflyMK1Thruster.capacity + dragonflyMK1Thruster.afterBurnerCapacity) * Math.SQRT2;

const SHOOTER_FACTION = Faction.Gravitas;

const behaviours = ['constant', 'jink', 'break', 'reverse', 'orbit'] as const;
type Behaviour = (typeof behaviours)[number];

const homingDesigns = (Object.keys(ammoDesigns) as AmmoType[]).filter((m) => ammoDesigns[m].homing);

type Rng = () => number;
const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

/** Per-tick desired velocity of the target; the target accelerates toward it at TARGET_MAX_ACCEL. */
function makePilot(behaviour: Behaviour, rng: Rng, initialVelocity: XY): (v: XY, dt: number) => XY {
    const speed = XY.lengthOf(initialVelocity);
    const heading = XY.angleOf(initialVelocity);
    switch (behaviour) {
        case 'constant':
            return () => initialVelocity;
        case 'jink': {
            let side = rng() < 0.5 ? 1 : -1;
            let nextFlip = between(rng, 0.5, 2);
            let t = 0;
            const offset = between(rng, 45, 90);
            return (_, dt) => {
                t += dt;
                if (t >= nextFlip) {
                    side = -side;
                    nextFlip = t + between(rng, 0.5, 2);
                }
                return XY.byLengthAndDirection(Math.max(speed, TARGET_MAX_SPEED / 2), heading + side * offset);
            };
        }
        case 'break': {
            // max-g turn: all acceleration perpendicular to velocity
            const side = rng() < 0.5 ? 1 : -1;
            return (v) => XY.add(v, XY.byLengthAndDirection(TARGET_MAX_ACCEL * 10, XY.angleOf(v) + side * 90));
        }
        case 'reverse':
            return () => XY.negate(XY.byLengthAndDirection(TARGET_MAX_SPEED, heading));
        case 'orbit': {
            // steady circle, radius from the tightest the hull can hold to three times that
            const side = rng() < 0.5 ? 1 : -1;
            const minRadius = (speed * speed) / TARGET_MAX_ACCEL;
            const radius = between(rng, minRadius, minRadius * 3);
            return (v, dt) => {
                const omega = (speed / Math.max(radius, 1)) * (180 / Math.PI);
                return XY.byLengthAndDirection(speed, XY.angleOf(v) + side * omega * dt);
            };
        }
    }
}

function steerTarget(target: Spaceship, desired: XY) {
    const dv = XY.difference(desired, target.velocity);
    const maxDv = TARGET_MAX_ACCEL * DT;
    const step = XY.lengthOf(dv) > maxDv ? XY.byLengthAndDirection(maxDv, XY.angleOf(dv)) : dv;
    let v = XY.add(target.velocity, step);
    if (XY.lengthOf(v) > TARGET_MAX_SPEED) {
        v = XY.byLengthAndDirection(TARGET_MAX_SPEED, XY.angleOf(v));
    }
    target.velocity = Vec2.make(v);
}

/** One engagement from the sprint boundary; true when the warhead goes off on the target. */
function engage(model: AmmoType, range: number, behaviour: Behaviour, rng: Rng): boolean {
    const homing = ammoDesigns[model].homing;
    if (!homing) {
        throw new Error(`${model} is not homing`);
    }
    const shooter = new Spaceship();
    shooter.init('shooter', Vec2.make({ x: 0, y: -15_000 }), 'dragonfly-MK1', SHOOTER_FACTION);
    // FULL scan holds only while a scan beam covers the target
    applyRadarSectors(shooter.radarSectors, [{ direction: 0, arc: 360, range: 50_000, isScanBeam: true }]);

    const target = new Spaceship();
    target.init('target', Vec2.make({ x: 0, y: 0 }), 'dragonfly-MK1', Faction.Raiders);
    target.velocity = Vec2.make(XY.byLengthAndDirection(between(rng, 0, TARGET_MAX_SPEED), between(rng, 0, 360)));
    target.scanLevels[SHOOTER_FACTION] = range === FULL_SCAN_RANGE ? ScanLevel.FULL : ScanLevel.BASIC;
    const pilot = makePilot(behaviour, rng, XY.clone(target.velocity));

    const missile = new Projectile(model);
    // start just inside the sprint boundary, by the most a fleeing target opens the range in one tick
    missile.init(
        'missile',
        Vec2.make(XY.byLengthAndDirection(range - TARGET_MAX_SPEED * DT + TARGET_RADIUS, between(rng, 0, 360))),
    );
    missile.shipId = shooter.id;
    missile.targetId = target.id;
    missile.secondsToLive = homing.secondsToLive;
    missile.armingSeconds = 0;
    // on course: cruising at top speed straight at the lead point
    const lead = predictInterceptPoint(missile.position, homing.maxSpeed * homing.sprint.speedMultiplier, target);
    const heading = XY.angleOf(XY.difference(lead, missile.position));
    missile.velocity = Vec2.make(XY.byLengthAndDirection(homing.maxSpeed, heading));
    missile.angle = heading;

    const spaceMgr = new SpaceManager();
    spaceMgr.insertBulk([shooter, target, missile]);
    spaceMgr.forceFlushEntities();

    for (let t = 0; t < homing.secondsToLive + 1; t += DT) {
        steerTarget(target, pilot(target.velocity, DT));
        const secondsLeft = missile.secondsToLive;
        tick(spaceMgr, DT);
        if (missile.destroyed) {
            // destroyed with flight time left: its fuze fired on the only solid thing near it
            return secondsLeft > DT;
        }
    }
    return false;
}

type Cell = { model: AmmoType; range: number; behaviour: Behaviour; misses: number; runs: number };

function measure(): Cell[] {
    const cells: Cell[] = [];
    let seed = 2151;
    for (const model of homingDesigns) {
        for (const range of [BASE_RANGE, FULL_SCAN_RANGE]) {
            for (const behaviour of behaviours) {
                const cell: Cell = { model, range, behaviour, misses: 0, runs: RUNS_PER_CELL };
                for (let i = 0; i < RUNS_PER_CELL; i++) {
                    if (!engage(model, range, behaviour, mulberry32(seed++))) {
                        cell.misses++;
                    }
                }
                cells.push(cell);
            }
        }
    }
    return cells;
}

describe('missile terminal-phase hit rate', () => {
    it(`misses a maneuvering Dragonfly MK-I under ${MAX_MISS_RATE * 100}% from the sprint boundary, per design, range and behaviour`, () => {
        const cells = measure();
        const table = cells
            .map((c) => `${c.model}\t${c.range}\t${c.behaviour}\t${((100 * c.misses) / c.runs).toFixed(1)}%`)
            .join('\n');
        // eslint-disable-next-line no-console
        console.log(`miss rates (model, start range, behaviour):\n${table}`);
        const failing = cells.filter((c) => c.misses / c.runs >= MAX_MISS_RATE);
        expect(failing.map((c) => `${c.model}@${c.range}/${c.behaviour}: ${c.misses}/${c.runs}`)).to.deep.equal([]);
    });
});
