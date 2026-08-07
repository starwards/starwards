import { ShipDesign } from '../ship';

export const smallStationArmor = {
    numberOfPlates: 36,
    layers: [
        { type: 'whipple' as const, plateMaxHealth: 40, withFaradayLayer: true },
        { type: 'composite' as const, plateMaxHealth: 60 },
    ],
};

export const smallStationOmniRadar = {
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

export const smallStationScanBeam = {
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

export const smallStationReactor = {
    modelName: 'Helios-4000 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 12,
    maxEnergy: 4_000,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
};

export const smallStationProperties = {
    modelName: 'Small Station',
    totalCoolant: 24,
    systemKillRatio: 0.5,
};

export const smallStationMagazine = {
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

export const smallStationSmartPilot = {
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

export const smallStationTargeting = {
    modelName: 'Falcon Targeting Computer',
    maxRange: 20_000,
    shortRange: 10_000,
};

export const smallStationDocking = {
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

export const smallStationManeuvering = {
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

export const smallStationSignals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 16,
    scanBaseDuration: 5,
};

export const smallStation = {
    properties: smallStationProperties,
    chainGuns: [],
    thrusters: [],
    tubes: [],
    radius: 50.4,
    armor: smallStationArmor,
    radars: [smallStationOmniRadar, smallStationScanBeam],
    smartPilot: smallStationSmartPilot,
    reactor: smallStationReactor,
    magazine: smallStationMagazine,
    weaponsTarget: smallStationTargeting,
    // stations don't warp
    warp: null,
    docking: smallStationDocking,
    maneuvering: smallStationManeuvering,
    signals: smallStationSignals,
} satisfies ShipDesign;
