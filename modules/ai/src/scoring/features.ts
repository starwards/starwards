import { JobStatus, SavedGame, ScanLevel, ShipState, XY } from '@starwards/core/internal';

import { offNose } from '../brain/verbal';

/**
 * Hand-engineered features of one `SavedGame` frame, seen from the player ship (the GVTS) against
 * its opponent. Deterministic, no history: velocities are part of the frame, so closing rate and
 * relative motion need no previous frame. The feature dictionary is `FEATURES` itself; the
 * scoring docs (`docs/integration/ai-crew.md#snapshot-scoring`) render it as a table.
 */

export type Station = 'helms' | 'weapons' | 'engineer' | 'signals' | 'overall';

/** The two ships a frame is scored for. */
export interface Duel {
    readonly player: ShipState;
    readonly target: ShipState;
}

interface Geometry {
    readonly distance: number;
    /** Target's bearing off the player's nose, -180..180 degrees. */
    readonly offNose: number;
    /** Player's angle off the target's tail (its motion, or its heading when nearly still), 0..180. */
    readonly offTail: number;
    readonly closingSpeed: number;
    readonly lateralSpeed: number;
}

interface Feature {
    readonly name: string;
    readonly station: Station;
    readonly unit: string;
    readonly meaning: string;
    readonly value: (duel: Duel, g: Geometry) => number;
}

/** Inside this band the forward chain gun can reach the target (gravitas: min shell range .. ~1.5 s of flight). */
export const GUN_BAND_METERS: readonly [number, number] = [500, 3000];

const b = (v: boolean) => (v ? 1 : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function armorRatio(ship: ShipState) {
    let health = 0;
    let max = 0;
    for (const plate of ship.armor.armorPlates) {
        for (const layer of plate.layers) {
            health += layer.health;
            max += layer.maxHealth;
        }
    }
    return max > 0 ? health / max : 0;
}

/** 0 destroyed .. 1 intact: mean of armor, systems (`healthRatio`) and capsule integrity. */
export function integrity(ship: ShipState) {
    return (armorRatio(ship) + ship.healthRatio + Math.max(0, ship.capsule.integrity)) / 3;
}

export function systemEffectiveness(ship: ShipState) {
    const systems = ship.systems();
    return {
        mean: mean(systems.map((s) => s.effectiveness)),
        min: systems.length ? Math.min(...systems.map((s) => s.effectiveness)) : 0,
        broken: mean(systems.map((s) => b(s.broken))),
        starved: mean(systems.map((s) => b('energyStarved' in s && s.energyStarved === true))),
        maxHeat: systems.length ? Math.max(...systems.map((s) => ('heat' in s ? Number(s.heat) : 0))) : 0,
        power: mean(systems.map((s) => s.power)),
    };
}

/** The player's scan level on the target, 0..3 (`ScanLevel`). */
export function scanLevel({ player, target }: Duel) {
    return target.spaceship.scanLevels.at(player.faction) ?? ScanLevel.UFO;
}

const SHELLS = ['HiExpShell', 'ArmPenShell', 'FragShell'] as const;
const MISSILES = ['HiExpMissile', 'ArmPenMissile', 'FragMissile', 'ClusterMissile', 'TandemMissile', 'ElecMissile'];

function ammoFraction(ship: ShipState, kinds: readonly string[]) {
    const magazine = ship.magazine as unknown as Record<string, number> & { design: Record<string, number> };
    let count = 0;
    let max = 0;
    for (const kind of kinds) {
        count += magazine[`count_${kind}`] ?? 0;
        max += magazine.design[`max_${kind}`] ?? 0;
    }
    return max > 0 ? count / max : 0;
}

/** Whether `player` is in firing position on `target`: in the gun band and aimed within the HE blast. */
export function inFiringPosition(g: Pick<Geometry, 'distance' | 'offNose'>) {
    return g.distance >= GUN_BAND_METERS[0] && g.distance <= GUN_BAND_METERS[1] && lateralMiss(g) <= 100;
}

function lateralMiss({ distance, offNose: off }: Pick<Geometry, 'distance' | 'offNose'>) {
    const abs = Math.abs(off);
    return abs >= 90 ? distance : distance * Math.sin((abs * Math.PI) / 180);
}

export function geometry({ player, target }: Duel): Geometry {
    const sight = XY.difference(target.position, player.position);
    const distance = XY.lengthOf(sight);
    const relVel = XY.difference(target.velocity, player.velocity);
    const unit = distance > 0 ? XY.scale(sight, 1 / distance) : { x: 1, y: 0 };
    const radial = relVel.x * unit.x + relVel.y * unit.y;
    const tail = XY.lengthOf(target.velocity) > 1 ? XY.angleOf(XY.negate(target.velocity)) : target.angle + 180;
    return {
        distance,
        offNose: offNose(XY.angleOf(sight), player.angle),
        offTail: Math.abs(offNose(XY.angleOf(XY.negate(sight)), tail)),
        closingSpeed: -radial,
        lateralSpeed: Math.abs(relVel.x * unit.y - relVel.y * unit.x),
    };
}

export const FEATURES: readonly Feature[] = [
    // helms: geometry and manoeuvre capacity
    {
        name: 'h_distance_km',
        station: 'helms',
        unit: 'km',
        meaning: 'distance to target',
        value: (_, g) => g.distance / 1000,
    },
    {
        name: 'h_off_nose',
        station: 'helms',
        unit: '0..1',
        meaning: '|target bearing off nose| / 180°',
        value: (_, g) => Math.abs(g.offNose) / 180,
    },
    {
        name: 'h_off_nose_cos',
        station: 'helms',
        unit: '-1..1',
        meaning: 'cos of target bearing off nose',
        value: (_, g) => Math.cos((g.offNose * Math.PI) / 180),
    },
    {
        name: 'h_off_tail',
        station: 'helms',
        unit: '0..1',
        meaning: "player's angle off the target's tail / 180°",
        value: (_, g) => g.offTail / 180,
    },
    {
        name: 'h_lateral_miss_km',
        station: 'helms',
        unit: 'km',
        meaning: 'how far the nose line passes beside the target (distance if > 90° off)',
        value: (_, g) => lateralMiss(g) / 1000,
    },
    {
        name: 'h_in_gun_band',
        station: 'helms',
        unit: '0/1',
        meaning: `distance within ${GUN_BAND_METERS.join('..')} m`,
        value: (_, g) => b(g.distance >= GUN_BAND_METERS[0] && g.distance <= GUN_BAND_METERS[1]),
    },
    {
        name: 'h_in_firing_position',
        station: 'helms',
        unit: '0/1',
        meaning: 'in gun band and nose line within 100 m of target',
        value: (_, g) => b(inFiringPosition(g)),
    },
    {
        name: 'h_closing_speed',
        station: 'helms',
        unit: 'km/s',
        meaning: 'rate the distance shrinks (negative: opening)',
        value: (_, g) => g.closingSpeed / 1000,
    },
    {
        name: 'h_lateral_speed',
        station: 'helms',
        unit: 'km/s',
        meaning: 'relative speed across the line of sight',
        value: (_, g) => g.lateralSpeed / 1000,
    },
    {
        name: 'h_own_speed',
        station: 'helms',
        unit: 'km/s',
        meaning: 'player speed',
        value: ({ player }) => player.speed / 1000,
    },
    {
        name: 'h_target_speed',
        station: 'helms',
        unit: 'km/s',
        meaning: 'target speed',
        value: ({ target }) => target.speed / 1000,
    },
    {
        name: 'h_turn_rate',
        station: 'helms',
        unit: '100°/s',
        meaning: '|player turn speed|',
        value: ({ player }) => Math.abs(player.turnSpeed) / 100,
    },
    {
        name: 'h_afterburner_fuel',
        station: 'helms',
        unit: '0..1',
        meaning: 'afterburner fuel / max',
        value: ({ player }) =>
            player.maneuvering.afterBurnerFuel / Math.max(1, player.maneuvering.design.maxAfterBurnerFuel),
    },
    {
        name: 'h_maneuvering',
        station: 'helms',
        unit: '0..1',
        meaning: 'maneuvering effectiveness × efficiency',
        value: ({ player }) => player.maneuvering.effectiveness * player.maneuvering.efficiency,
    },
    // weapons: lock, gun, ammo, target damage state
    {
        name: 'w_locked',
        station: 'weapons',
        unit: '0/1',
        meaning: 'weapons target is the target',
        value: ({ player, target }) => b(player.weaponsTarget.targetId === target.id),
    },
    {
        name: 'w_gun_firing',
        station: 'weapons',
        unit: '0/1',
        meaning: 'any chain gun firing',
        value: ({ player }) => b(player.chainGuns.some((g) => g.isFiring)),
    },
    {
        name: 'w_gun_loading',
        station: 'weapons',
        unit: '0..1',
        meaning: 'mean chain gun load progress',
        value: ({ player }) => mean(player.chainGuns.map((g) => g.loading)),
    },
    {
        name: 'w_gun_effectiveness',
        station: 'weapons',
        unit: '0..1',
        meaning: 'mean chain gun effectiveness',
        value: ({ player }) => mean(player.chainGuns.map((g) => g.effectiveness)),
    },
    {
        name: 'w_gun_heat',
        station: 'weapons',
        unit: 'heat',
        meaning: 'max chain gun heat',
        value: ({ player }) => Math.max(0, ...player.chainGuns.map((g) => g.heat)),
    },
    {
        name: 'w_shells',
        station: 'weapons',
        unit: '0..1',
        meaning: 'shell rounds / magazine capacity',
        value: ({ player }) => ammoFraction(player, SHELLS),
    },
    {
        name: 'w_missiles',
        station: 'weapons',
        unit: '0..1',
        meaning: 'missiles / magazine capacity',
        value: ({ player }) => ammoFraction(player, MISSILES),
    },
    {
        name: 'w_target_armor',
        station: 'weapons',
        unit: '0..1',
        meaning: 'target armor health ratio',
        value: ({ target }) => armorRatio(target),
    },
    {
        name: 'w_target_systems',
        station: 'weapons',
        unit: '0..1',
        meaning: 'target healthRatio (systems intact)',
        value: ({ target }) => target.healthRatio,
    },
    {
        name: 'w_target_capsule',
        station: 'weapons',
        unit: '0..1',
        meaning: 'target capsule integrity',
        value: ({ target }) => Math.max(0, target.capsule.integrity),
    },
    // engineer: energy, power, damage
    {
        name: 'e_reactor_energy',
        station: 'engineer',
        unit: '0..1',
        meaning: 'reactor energy / max',
        value: ({ player }) => player.reactor.energy / Math.max(1, player.reactor.design.maxEnergy),
    },
    {
        name: 'e_energy_cells',
        station: 'engineer',
        unit: '0..1',
        meaning: 'energy cells / max',
        value: ({ player }) => player.reactor.energyCells / Math.max(1, player.reactor.design.maxEnergyCells),
    },
    {
        name: 'e_mean_effectiveness',
        station: 'engineer',
        unit: '0..1',
        meaning: 'mean effectiveness over all systems',
        value: ({ player }) => systemEffectiveness(player).mean,
    },
    {
        name: 'e_min_effectiveness',
        station: 'engineer',
        unit: '0..1',
        meaning: 'lowest system effectiveness',
        value: ({ player }) => systemEffectiveness(player).min,
    },
    {
        name: 'e_broken',
        station: 'engineer',
        unit: '0..1',
        meaning: 'share of systems broken',
        value: ({ player }) => systemEffectiveness(player).broken,
    },
    {
        name: 'e_starved',
        station: 'engineer',
        unit: '0..1',
        meaning: 'share of systems energy-starved',
        value: ({ player }) => systemEffectiveness(player).starved,
    },
    {
        name: 'e_max_heat',
        station: 'engineer',
        unit: 'heat',
        meaning: 'hottest system heat',
        value: ({ player }) => systemEffectiveness(player).maxHeat,
    },
    {
        name: 'e_mean_power',
        station: 'engineer',
        unit: '0..1',
        meaning: 'mean power setting over systems',
        value: ({ player }) => systemEffectiveness(player).power,
    },
    {
        name: 'e_own_armor',
        station: 'engineer',
        unit: '0..1',
        meaning: 'player armor health ratio',
        value: ({ player }) => armorRatio(player),
    },
    {
        name: 'e_own_systems',
        station: 'engineer',
        unit: '0..1',
        meaning: 'player healthRatio',
        value: ({ player }) => player.healthRatio,
    },
    {
        name: 'e_own_capsule',
        station: 'engineer',
        unit: '0..1',
        meaning: 'player capsule integrity',
        value: ({ player }) => Math.max(0, player.capsule.integrity),
    },
    {
        name: 'e_repair_slots',
        station: 'engineer',
        unit: 'count',
        meaning: 'repair queue slots in use',
        value: ({ player }) => player.repairQueue.slots.length,
    },
    // signals: knowledge of the target
    {
        name: 's_scan_level',
        station: 'signals',
        unit: '0..1',
        meaning: 'scan level on target / FULL',
        value: (duel) => scanLevel(duel) / ScanLevel.FULL,
    },
    {
        name: 's_jobs',
        station: 'signals',
        unit: 'count',
        meaning: 'signals jobs retained',
        value: ({ player }) => player.signals.jobs.length,
    },
    {
        name: 's_target_job_progress',
        station: 'signals',
        unit: '0..1',
        meaning: 'progress of the in-progress job on the target (0 if none)',
        value: ({ player, target }) =>
            player.signals.jobs.find((j) => j.targetId === target.id && j.status === JobStatus.IN_PROGRESS)?.progress ??
            0,
    },
    {
        name: 's_signals_effectiveness',
        station: 'signals',
        unit: '0..1',
        meaning: 'signals system effectiveness',
        value: ({ player }) => player.signals.effectiveness,
    },
    {
        name: 's_radar_effectiveness',
        station: 'signals',
        unit: '0..1',
        meaning: 'mean radar effectiveness',
        value: ({ player }) => mean(player.radars.map((r) => r.effectiveness)),
    },
    // overall: the opponent's threat
    {
        name: 'o_target_gun_effectiveness',
        station: 'overall',
        unit: '0..1',
        meaning: 'target mean chain gun effectiveness',
        value: ({ target }) => mean(target.chainGuns.map((g) => g.effectiveness)),
    },
    {
        name: 'o_target_shells',
        station: 'overall',
        unit: '0..1',
        meaning: 'target shell rounds / capacity',
        value: ({ target }) => ammoFraction(target, SHELLS),
    },
    {
        name: 'o_target_hostile',
        station: 'overall',
        unit: '0/1',
        meaning: 'target follows an order or fights back when idle (not PLAY_DEAD)',
        value: ({ target }) => b(target.order !== 0 || target.idleStrategy !== 0),
    },
];

export const FEATURE_NAMES = FEATURES.map((f) => f.name);

/**
 * The player (first player ship by id) and its opponent (nearest ship of another faction), or
 * `undefined` when either is missing -- e.g. after the kill, when the target has despawned.
 */
export function findDuel(saved: SavedGame, playerId?: string): Duel | undefined {
    const ships = [...saved.fragment.ship.values()].sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
    const player = playerId ? ships.find((s) => s.id === playerId) : ships.find((s) => s.isPlayerShip);
    if (!player) return undefined;
    let target: ShipState | undefined;
    let best = Infinity;
    for (const ship of ships) {
        if (ship.faction === player.faction || ship.spaceship.destroyed) continue;
        const d = XY.lengthOf(XY.difference(ship.position, player.position));
        if (d < best) {
            best = d;
            target = ship;
        }
    }
    return target ? { player, target } : undefined;
}

/** Feature vector in `FEATURE_NAMES` order. */
export function extractFeatures(duel: Duel): number[] {
    const g = geometry(duel);
    return FEATURES.map((f) => f.value(duel, g));
}
