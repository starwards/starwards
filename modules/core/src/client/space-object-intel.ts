import { ArmorLayer, ShipState } from '../ship';
import {
    Derelict,
    Faction,
    ScanLevel,
    SpaceObject,
    Spaceship,
    WeaponDamageType,
    isMissile,
    weaponDamageTypes,
} from '../space';

/**
 * The scan level a player holds on an object. A GM view (no faction) sees everything; same-faction
 * objects are always at least BASIC.
 */
export function playerScanLevel(o: SpaceObject, playerFaction: Faction | undefined): ScanLevel {
    if (playerFaction === undefined) {
        return ScanLevel.FULL;
    }
    const factionIndex = Number(playerFaction);
    const rawLevel =
        factionIndex >= 0 && factionIndex < o.scanLevels.length
            ? ((o.scanLevels[factionIndex] as ScanLevel | undefined) ?? ScanLevel.UFO)
            : ScanLevel.UFO;
    if (o.faction === playerFaction && playerFaction !== Faction.NONE) {
        return Math.max(rawLevel, ScanLevel.BASIC);
    }
    return rawLevel;
}

/**
 * The contacts the signals station's target cycle steps through: every unidentified contact,
 * whatever it turns out to be, plus the ships already identified and the identified missiles whose
 * warhead is not yet read.
 *
 * Membership keys on scan level, never on type below BASIC — a cycle that visited exactly the
 * ships would tell the player which unidentified blips are ships just by being pressed. Above
 * BASIC the player has already earned the type, so excluding identified non-ships leaks nothing:
 * a rock at BASIC has nothing left to reveal, while a ship at SNAPSHOT can be marked and rescanned
 * when it re-enters range.
 */
export function scanCycleTargets(
    objects: Iterable<SpaceObject>,
    playerFaction: Faction | undefined,
    selfId: string,
): SpaceObject[] {
    return [...objects].filter((o) => {
        if (o.id === selfId) {
            return false;
        }
        const scanLevel = playerScanLevel(o, playerFaction);
        return (
            scanLevel === ScanLevel.UFO || Spaceship.isInstance(o) || (isMissile(o) && scanLevel < ScanLevel.SNAPSHOT)
        );
    });
}

/**
 * Human-facing name for a space object, for station panels and callouts.
 *
 * `makeId()` is a global incrementing counter, so ids are already short speakable integers that
 * stay stable for an object's lifetime — `Asteroid 47` needs no bookkeeping, and an object
 * missing from the space state falls back to its bare id.
 *
 * The type is disclosed only from BASIC up, where the player has earned it. A name is a
 * player-facing surface, so naming an unscanned contact by type would classify it for free.
 * A ship's callsign wins when it has one, which is BASIC-gated for the same reason; a wreck's
 * callsign is suffixed so it never reads as the live ship (#2329).
 *
 * Single override point: the planned relay-owned naming database replaces names here.
 */
export function objectDisplayName(
    object: SpaceObject | undefined,
    id: string,
    scanLevel: ScanLevel = ScanLevel.FULL,
): string {
    if (!object || scanLevel < ScanLevel.BASIC) {
        return id;
    }
    if (Spaceship.isInstance(object) && object.callsign) {
        return object.callsign;
    }
    // a wreck keeps its dead ship's callsign, marked so it never reads as the live ship
    if (Derelict.isInstance(object) && object.callsign) {
        return `${object.callsign} (wreck)`;
    }
    return `${object.type} ${object.id}`;
}

/** One armor layer's design: the model and how it answers each weapon damage type. */
export type ArmorLayerIntel = {
    /** armor model name, e.g. `composite` */
    model: string;
    plateMaxHealth: number;
    /** per weapon damage type: plate damage factor (0 = not engaged) */
    plateDamage: Record<WeaponDamageType, number>;
    /** per weapon damage type: fraction of the hit that leaks through an intact plate */
    penetration: Record<WeaponDamageType, number>;
};

/** One armor plate's current state. Plate `index` covers ship-local degrees `[index, index + 1) * degreesPerPlate`. */
export type ArmorPlateIntel = {
    index: number;
    /** 0..1, over all its layers */
    healthRatio: number;
    /** true when every layer is down: hits on this arc reach the hull */
    broken: boolean;
    /** outermost first, aligned with `ArmorIntel.layers` */
    layers: { health: number; maxHealth: number }[];
};

export type ArmorIntel = {
    numberOfPlates: number;
    degreesPerPlate: number;
    healthyPlates: number;
    /** layer designs, outermost first; every plate carries the same stack */
    layers: ArmorLayerIntel[];
    plates: ArmorPlateIntel[];
};

/** A ship's design as a scan reveals it: model, design facts, and armor plates with their current state. */
export type ShipDesignIntel = {
    /** design model name, e.g. `Dragonfly` */
    model: string;
    /** ratio of broken systems that mission-kills the ship */
    systemKillRatio: number;
    totalCoolant: number;
    maxSpeed: number;
    maxEnergy: number;
    tubes: number;
    chainGuns: number;
    armor: ArmorIntel;
};

function perDamageType(f: (t: WeaponDamageType) => number) {
    return Object.fromEntries(weaponDamageTypes.map((t) => [t, f(t)])) as Record<WeaponDamageType, number>;
}

function armorLayerIntel(layer: ArmorLayer): ArmorLayerIntel {
    return {
        model: layer.design.modelName,
        plateMaxHealth: layer.design.plateMaxHealth,
        plateDamage: perDamageType((t) => layer.design.plateDamage(t)),
        penetration: perDamageType((t) => layer.design.penetration(t)),
    };
}

/**
 * The design facts and armor state of a ship, read from its `ShipState` (live, or a decoded
 * snapshot). Ungated: callers gate on scan level through {@link targetIntel}.
 */
export function shipDesignIntel(state: ShipState): ShipDesignIntel {
    const armor = state.armor;
    const plates = [...armor.armorPlates];
    return {
        model: state.design.modelName,
        systemKillRatio: state.design.systemKillRatio,
        totalCoolant: state.design.totalCoolant,
        maxSpeed: state.smartPilot?.design.maxSpeed ?? 0,
        maxEnergy: state.reactor?.design.maxEnergy ?? 0,
        tubes: state.tubes.length,
        chainGuns: state.chainGuns.length,
        armor: {
            numberOfPlates: armor.numberOfPlates,
            degreesPerPlate: armor.degreesPerPlate,
            healthyPlates: armor.numberOfHealthyPlates,
            layers: plates[0] ? [...plates[0].layers].map(armorLayerIntel) : [],
            plates: plates.map((plate, index) => ({
                index,
                healthRatio: plate.healthRatio,
                broken: plate.broken,
                layers: [...plate.layers].map((l) => ({ health: l.health, maxHealth: l.maxHealth })),
            })),
        },
    };
}

/** Where a client gets a target ship's internals from: its live state, and its faction's frozen snapshot. */
export type ShipIntelSource = {
    /** the ship's live `ShipState`; undefined while it is not (yet) available */
    live(ship: Spaceship): ShipState | undefined;
    /** the faction's snapshot of the ship (SPEC-0008); undefined while it is not (yet) available */
    snapshot(ship: Spaceship, faction: Faction): { state: ShipState; ageSeconds: number } | undefined;
};

/**
 * Which internals a scan level admits. FULL reads live state, SNAPSHOT reads the state frozen when
 * line of sight was lost, and BASIC and below reveal no internals at all.
 */
export function designIntelSource(scanLevel: ScanLevel): 'live' | 'snapshot' | undefined {
    if (scanLevel >= ScanLevel.FULL) return 'live';
    if (scanLevel === ScanLevel.SNAPSHOT) return 'snapshot';
    return undefined;
}

/**
 * A target ship's internals as a faction may know them.
 * - `LIVE`: FULL scan, `design` is current.
 * - `SNAPSHOT`: `design` is frozen `ageSeconds` ago.
 * - `PENDING`: the scan level admits internals but the source has not delivered them yet.
 * - `NONE`: nothing to reveal (no target, not a ship, or BASIC/UFO).
 */
export type TargetIntel = {
    intel: 'LIVE' | 'SNAPSHOT' | 'PENDING' | 'NONE';
    scanLevel?: keyof typeof ScanLevel;
    ageSeconds?: number;
    design?: ShipDesignIntel;
};

/** The internals `playerFaction` holds on `subject`, gated by its scan level. */
export function targetIntel(
    subject: SpaceObject | undefined,
    playerFaction: Faction | undefined,
    source: ShipIntelSource,
): TargetIntel {
    if (!subject) return { intel: 'NONE' };
    const scanLevel = playerScanLevel(subject, playerFaction);
    const level = ScanLevel[scanLevel] as keyof typeof ScanLevel;
    const from = designIntelSource(scanLevel);
    if (!from || !Spaceship.isInstance(subject)) return { intel: 'NONE', scanLevel: level };
    if (from === 'live') {
        const state = source.live(subject);
        return state
            ? { intel: 'LIVE', scanLevel: level, design: shipDesignIntel(state) }
            : { intel: 'PENDING', scanLevel: level };
    }
    const snapshot = playerFaction === undefined ? undefined : source.snapshot(subject, playerFaction);
    return snapshot
        ? {
              intel: 'SNAPSHOT',
              scanLevel: level,
              ageSeconds: snapshot.ageSeconds,
              design: shipDesignIntel(snapshot.state),
          }
        : { intel: 'PENDING', scanLevel: level };
}
