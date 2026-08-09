// Public API surface for @starwards/core.
//
// Only symbols that modules/browser needs belong here. modules/server and
// modules/node-red import from '@starwards/core/internal' instead.
// Enforced by dependency-cruiser rule 'no-core-internal-from-browser'.

// --- admin ---
export { AdminState, GameStatus } from './admin';

// --- client ---
export {
    AdminDriver,
    ClientStatus,
    Driver,
    ShipDriver,
    SpaceDriver,
    Status,
    getSpatialIndex,
    objectDisplayName,
    playerScanLevel,
    scanCycleTargets,
} from './client';
export type { ShipDriverRead, SpaceEventEmitter } from './client';

// --- configurations ---
export { demoShip, getAvailableRepairProtocols, repairProtocols, shipModels } from './configurations';
export type { RepairProtocolName, RepairProtocolStats, ShipModel } from './configurations';

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
    calcArcAngle,
    capToRange,
    degToRad,
    getClosestDockingTarget,
    getShellExplosionLocation,
    getTargetLocationAtShellExplosion,
    isInRange,
    lerp,
    literal2Range,
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
    PowerLevel,
    PowerLevelStep,
    RepairOperationStatus,
    ShipState,
    Signals,
    SignalsJob,
    SmartPilotMode,
    TargetedStatus,
    WarpFrequency,
    isRestockingAmmo,
    isRestockingEnergyCells,
    makeShipState,
    repairCommands,
} from './ship';
export type { DefectibleValue, RepairOperation, System } from './ship';

// --- stations-manifest ---
export { isRadarWidget, stationCommands, stationRadarWidgets, stationWidgets } from './stations-manifest';
export type {
    StationCommand,
    StationEntry,
    StationRadarWidget,
    StationWidget,
    StationsManifest,
} from './stations-manifest';

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
    ammoDesigns,
    ammoTypes,
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

// --- version ---
export { VERSION } from './version';

// --- space-object-base (re-exported via ./space) ---
export { TypeFilter, filterObject } from './space';
