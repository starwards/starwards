import { ShipDesign } from '../ship';

export const dragonflyMK1Armor = {
    numberOfPlates: 8,
    layers: [{ type: 'composite' as const, plateMaxHealth: 50 }],
};

export const dragonflyMK1Thruster = {
    modelName: 'RT-150 Vectored Thruster',
    isInternal: false,
    isElectronics: false,
    bearingLimit: 0,
    maxBearingSkew: 45,
    capacity: 300,
    energyCost: 0.07,
    afterBurnerCapacity: 300,
    damage50: 15,
};

export const dragonflyMK1OmniRadar = {
    modelName: 'Argus-10k Phased Radar',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 20_000,
    minArc: 360,
    maxArc: 360,
    defaultArc: 360,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 10_000,
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 0,
};

export const dragonflyMK1ScanBeam = {
    modelName: 'Lancet-20 Directional Scan Beam',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 30_000,
    minArc: 5,
    maxArc: 90,
    defaultArc: 20,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 15_000,
    turnSpeed: 30,
    bearingLimit: 180,
    maxBearingSkew: 45,
};

export const dragonflyMK1Chaingun = {
    modelName: 'Hailstorm 8RPS Chaingun',
    isInternal: false,
    isElectronics: true,
    bulletsPerSecond: 8,
    bulletSpeed: 1_000,
    bulletDegreesDeviation: 1,
    maxShellRange: 4_500,
    minShellRange: 500,
    overrideSecondsToLive: 0,
    use_HiExpShell: true,
    use_ArmPenShell: true,
    use_FragShell: true,
    use_HiExpMissile: false,
    use_ArmPenMissile: false,
    use_FragMissile: false,
    use_ClusterMissile: false,
    use_TandemMissile: false,
    use_ElecMissile: false,
    damage50: 20,
    energyCost: 1,
    // bolted to the hull, facing forward: the ship is aimed by turning the ship
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 90,
};

export const dragonflyMK1Reactor = {
    modelName: 'Helios-500 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 3,
    maxEnergy: 500,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
};

export const dragonflyMK1Properties = {
    modelName: 'Dragonfly MK I "Recon"',
    totalCoolant: 6,
    systemKillRatio: 0.5,
};

export const dragonflyMK1Magazine = {
    modelName: 'Hornet Mk-I Magazine',
    isInternal: true,
    isElectronics: true,
    max_HiExpShell: 960,
    max_ArmPenShell: 480,
    max_FragShell: 800,
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

export const dragonflyMK1SmartPilot = {
    modelName: 'Nimbus-3 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 270,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 600,
    // no afterburner speed bonus on this hull
    maxSpeedFromAfterBurner: 600,
};

export const dragonflyMK1Targeting = {
    modelName: 'Falcon Targeting Computer',
    maxRange: 10_000,
    shortRange: 5_000,
};

export const dragonflyMK1Warp = {
    modelName: 'Voyager-X Warp Drive',
    isInternal: true,
    isElectronics: true,
    damage50: 20,
    maxProximity: 10_000,
    chargeTime: 10,
    dechargeTime: 5,
    speedPerLevel: 800,
    energyCostPerLevel: 2,
    damagePerPhysicalSpeed: 20,
    baseDamagePerWarpSpeedPerSecond: 0.1,
    secondsToChangeFrequency: 10,
};

export const dragonflyMK1Docking = {
    modelName: 'Gripper-1 Docking Clamp',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxDockingDistance: 1_000,
    maxDockedDistance: 20,
    undockingTargetDistance: 100,
    angle: -90,
    width: 45,
};

export const dragonflyMK1Maneuvering = {
    modelName: 'Pivot-205 Maneuvering Suite',
    isInternal: true,
    isElectronics: false,
    rotationCapacity: 205,
    rotationEnergyCost: 0.07,
    maxAfterBurnerFuel: 5_000,
    afterBurnerCharge: 20,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};

export const dragonflyMK1Signals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 4,
    scanBaseDuration: 5,
};

export const dragonflyMK1 = {
    properties: dragonflyMK1Properties,
    chainGuns: [['FWD', dragonflyMK1Chaingun]],
    thrusters: [
        ['STBD', dragonflyMK1Thruster],
        ['PORT', dragonflyMK1Thruster],
        ['FWD', dragonflyMK1Thruster],
        ['AFT', dragonflyMK1Thruster],
    ],
    tubes: [],
    radius: 11.2,
    armor: dragonflyMK1Armor,
    radars: [dragonflyMK1OmniRadar, dragonflyMK1ScanBeam],
    smartPilot: dragonflyMK1SmartPilot,
    reactor: dragonflyMK1Reactor,
    magazine: dragonflyMK1Magazine,
    weaponsTarget: dragonflyMK1Targeting,
    warp: dragonflyMK1Warp,
    docking: dragonflyMK1Docking,
    maneuvering: dragonflyMK1Maneuvering,
    signals: dragonflyMK1Signals,
} satisfies ShipDesign;
