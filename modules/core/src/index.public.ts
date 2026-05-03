// Public API surface for @starwards/core.
//
// Only symbols that modules/browser needs belong here. modules/server and
// modules/node-red import from '@starwards/core/internal' instead.
// Enforced by dependency-cruiser rule 'no-core-internal-from-browser'.

// --- admin ---
export { AdminState, GameStatus } from './admin';

// --- client ---
export { AdminDriver, ClientStatus, Driver, ShipDriver, SpaceDriver, Status } from './client';
export type { ShipDriverRead, SpaceEventEmitter } from './client';

// --- configurations ---
export { dragonflySF22, shipModels } from './configurations';
export type { ShipModel } from './configurations';

// --- events ---
export type { RoomEventEmitter } from './events';

// --- json-ptr ---
export { getJsonPointer } from './json-ptr';
export type { JsonStringPointer } from './json-ptr';

// --- logic ---
export {
    XY,
    FieldOfView,
    Iterator,
    ammoTypes,
    armorTypes,
    calcArcAngle,
    capToRange,
    damageMultiplierForOutcome,
    degToRad,
    getClosestDockingTarget,
    getShellExplosionLocation,
    getTargetLocationAtShellExplosion,
    isInRange,
    isSurfaceEffectAmmo,
    lerp,
    literal2Range,
    resolveHullOutcome,
    systemDamageProfile,
} from './logic';
export type {
    AmmoType,
    ArmorType,
    HullOutcome,
    SystemDamageProfile,
    SystemDamageScope,
    SystemDamageSeverity,
} from './logic';
export type { RTuple2, Tuple2 } from './logic';

// --- range ---
export { getRange } from './range';

// --- ship ---
export {
    ChainGun,
    DesignState,
    DockingMode,
    HackLevel,
    IdleStrategy,
    JobStatus,
    JobType,
    PowerLevel,
    PowerLevelStep,
    ShipState,
    Signals,
    SignalsJob,
    SmartPilotMode,
    TargetedStatus,
    WarpFrequency,
    makeShipState,
} from './ship';
export type { DefectibleValue, System } from './ship';

// --- space ---
export {
    Asteroid,
    Faction,
    Projectile,
    ScanLevel,
    SpaceState,
    Spaceship,
    Waypoint,
    getSectorName,
    projectileDesigns,
    projectileModels,
    sectorSize,
    spaceCommands,
} from './space';
export type { SpaceObject, SpaceObjects } from './space';

// --- task-loop ---
export { TaskLoop } from './task-loop';

// --- tweakable ---
export { getTweakables } from './tweakable';

// --- utils ---
export { Destructors, assertUnreachable } from './utils';
export type { Destructor } from './utils';

// --- logger ---
export { createLogger } from './logger';

// --- space-object-base (re-exported via ./space) ---
export { TypeFilter, filterObject } from './space';
