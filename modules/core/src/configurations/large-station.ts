import { ShipDesign } from '../ship';

export const largeStationArmor = {
    numberOfPlates: 36,
    layers: [
        { type: 'hardened' as const, plateMaxHealth: 16.6667, withFaradayLayer: true },
        { type: 'composite' as const, plateMaxHealth: 25 },
    ],
};

export const largeStationOmniRadar = {
    modelName: 'Argus-120k Phased Radar',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 120_000,
    minArc: 360,
    maxArc: 360,
    defaultArc: 360,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 60_000,
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 0,
};

export const largeStationScanBeam = {
    modelName: 'Lancet-100 Directional Scan Beam',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 100_000,
    minArc: 5,
    maxArc: 90,
    defaultArc: 20,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 50_000,
    turnSpeed: 30,
    bearingLimit: 180,
    maxBearingSkew: 45,
};

export const largeStationReactor = {
    modelName: 'Helios-4000 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 12,
    maxEnergy: 4_000,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
    maxEnergyCells: 2,
};

export const largeStationProperties = {
    modelName: 'Large Station',
    totalCoolant: 24,
    systemKillRatio: 0.6,
};

export const largeStationMagazine = {
    modelName: 'unarmed',
    isInternal: true,
    isElectronics: true,
    max_HiExpShell: 0,
    max_ArmPenShell: 0,
    max_FragShell: 0,
    max_HiExpMissile: 0,
    max_ArmPenMissile: 0,
    max_FragMissile: 0,
    max_ClusterMissile: 0,
    max_TandemMissile: 0,
    max_ElecMissile: 0,
    damage50: 20,
    capacityBrokenThreshold: 0.15,
    capacityDamageFactor: 0.1,
};

export const largeStationSmartPilot = {
    modelName: 'Nimbus-1 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    // static platform: does not rotate
    maxTurnSpeed: 0,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 0,
    maxSpeedFromAfterBurner: 0,
};

export const largeStationTargeting = {
    modelName: 'Falcon Targeting Computer',
    maxRange: 20_000,
    shortRange: 10_000,
};

export const largeStationDocking = {
    modelName: 'Gripper-3 Docking Clamp',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxDockingDistance: 3_000,
    maxDockedDistance: 20,
    undockingTargetDistance: 100,
    angle: -90,
    width: 45,
    isDockingHost: true,
};

export const largeStationManeuvering = {
    modelName: 'Pivot-60 Maneuvering Suite',
    isInternal: true,
    isElectronics: false,
    rotationCapacity: 60,
    rotationEnergyCost: 0.07,
    maxAfterBurnerFuel: 0,
    afterBurnerCharge: 0,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};

export const largeStationSignals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 16,
    scanBaseDuration: 5,
};

export const largeStation = {
    properties: largeStationProperties,
    chainGuns: [],
    thrusters: [],
    tubes: [],
    radius: 1_200,
    armor: largeStationArmor,
    radars: [largeStationOmniRadar, largeStationScanBeam],
    smartPilot: largeStationSmartPilot,
    reactor: largeStationReactor,
    magazine: largeStationMagazine,
    weaponsTarget: largeStationTargeting,
    // stations don't warp
    warp: null,
    docking: largeStationDocking,
    maneuvering: largeStationManeuvering,
    signals: largeStationSignals,
} satisfies ShipDesign;
