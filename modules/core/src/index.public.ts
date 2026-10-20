// Public API surface for @starwards/core.
//
// Only symbols that modules/browser needs belong here. modules/server and
// modules/node-red import from '@starwards/core/internal' instead.
// Enforced by dependency-cruiser rule 'no-core-internal-from-browser'.

// --- admin ---
export { AdminState, BotEntry, GameStatus, ShipBots, botBrains, botStatuses } from './admin';
export type { AssignBotArg, BotBrain, BotStatus } from './admin';

// --- client ---
export {
    AdminDriver,
    ClientStatus,
    Driver,
    ShipDriver,
    SnapshotFetch,
    SpaceDriver,
    Status,
    beginStationRegistration,
    getSpatialIndex,
    objectDisplayName,
    playerScanLevel,
    helmsRadarReach,
    radarReach,
    scanCycleTargets,
    snapshotShipDriver,
} from './client';
export type {
    NetworkAddress,
    NetworkInfo,
    RecordingInfo,
    ShipDriverRead,
    ShipIdSource,
    SpaceEventEmitter,
    StationRegistration,
} from './client';

// --- configurations ---
export {
    demoShip,
    getAvailableRepairProtocols,
    getModeStats,
    hasProtocolEquipment,
    repairProtocols,
    shipModels,
} from './configurations';
export type { RepairProtocolModeStats, RepairProtocolName, RepairProtocolStats, ShipModel } from './configurations';

// --- events ---
export type { RoomEventEmitter } from './events';

// --- json-ptr ---
export { getJsonPointer } from './json-ptr';
export type { JsonStringPointer } from './json-ptr';

// --- lock-commands ---
export { lockCommands } from './lock-commands';
export type { LockPropertyArg } from './lock-commands';

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

// --- recording ---
export {
    EVENTS_EXT,
    RECORDING_EXT,
    SPACE_ROOM_KEY,
    ReplayRoom,
    SavedGame,
    decodeFrame,
    decodeRecordedBytes,
    decodeSegment,
    encodeSegment,
    sidecarName,
    deepAssignSchema,
    parseBaseLine,
    parseEventLine,
    parseFrameLine,
    parseHeader,
    parseSegLine,
    reconstructSegment,
    recordingSchemaHash,
} from './recording';
export type {
    RecordingBaseLine,
    RecordingEventLine,
    RecordingFrameLine,
    RecordingHeader,
    RecordingSegLine,
} from './recording';

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
    CREW_ORDER_KINDS,
    ORDER_PARAMS,
    ORDER_SLOTS,
    RepairPriority,
    RepairProtocolMode,
    ShipState,
    Signals,
    SignalsJob,
    SmartPilotMode,
    TargetedStatus,
    WarpFrequency,
    decodeShipSnapshot,
    getDirectionConfigFromAngle,
    isRestockingAmmo,
    isRestockingEnergyCells,
    crewOrderCommands,
    makeShipState,
    repairCommands,
} from './ship';
export type { CrewOrder, CrewOrderBoard, DefectibleValue, RepairProtocolSlot, SnapshotMessage, System } from './ship';

// --- stations ---
export { StationRegistryEntry, isValidStationId } from './stations';
export type { AssignStationArg, RegisterStationArg } from './stations';

// --- stations-manifest ---
export {
    botSeatsConflict,
    bridgeSeats,
    isAssignableSeat,
    isBridgeSeat,
    isRadarWidget,
    multiplexedStations,
    rosterSeats,
    seatOfScreen,
    seatScreens,
    stationCommands,
    stationRadarWidgets,
    stationWidgets,
} from './stations-manifest';
export type {
    BridgeSeat,
    StationCommand,
    StationEntry,
    StationRadarWidget,
    StationWidget,
    StationsManifest,
} from './stations-manifest';

// --- space ---
export {
    Asteroid,
    Explosion,
    Faction,
    Projectile,
    ScanLevel,
    SpaceState,
    Spaceship,
    Waypoint,
    getSectorName,
    ammoDesigns,
    ammoTypes,
    magazineStocks,
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
