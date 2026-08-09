import { ShipDesign } from '../ship';

export const dragonflyMK2Armor = {
    numberOfPlates: 8,
    layers: [{ type: 'composite' as const, plateMaxHealth: 75 }],
};

export const dragonflyMK2Thruster = {
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

export const dragonflyMK2OmniRadar = {
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
    malfunctionRange: 2_000,
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 0,
};

export const dragonflyMK2Chaingun = {
    modelName: 'Hailstorm 14RPS Chaingun',
    isInternal: false,
    isElectronics: true,
    bulletsPerSecond: 14,
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

export const dragonflyMK2Reactor = {
    modelName: 'Helios-500 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 3,
    maxEnergy: 500,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
};

export const dragonflyMK2Properties = {
    modelName: 'Dragonfly MK II "Heavy Interceptor"',
    totalCoolant: 6,
    systemKillRatio: 0.5,
};

export const dragonflyMK2Magazine = {
    modelName: 'Hornet Mk-II Magazine',
    isInternal: true,
    isElectronics: true,
    max_HiExpShell: 1_680,
    max_ArmPenShell: 840,
    max_FragShell: 1_400,
    max_HiExpMissile: 0,
    max_ArmPenMissile: 4,
    max_FragMissile: 0,
    max_ClusterMissile: 0,
    max_TandemMissile: 0,
    max_ElecMissile: 0,
    damage50: 20,
    capacityBrokenThreshold: 0.15,
    capacityDamageFactor: 0.1,
};

export const dragonflyMK2SmartPilot = {
    modelName: 'Nimbus-3 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 240,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 400,
    // no afterburner speed bonus on this hull
    maxSpeedFromAfterBurner: 400,
};

export const dragonflyMK2Targeting = {
    modelName: 'Falcon Targeting Computer',
    maxRange: 10_000,
    shortRange: 5_000,
};

export const dragonflyMK2Warp = {
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

export const dragonflyMK2Docking = {
    modelName: 'Gripper-1 Docking Clamp',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxDockingDistance: 1_000,
    maxDockedDistance: 20,
    undockingTargetDistance: 100,
    angle: -90,
    width: 45,
    isDockingHost: false,
};

export const dragonflyMK2Maneuvering = {
    modelName: 'Pivot-160 Maneuvering Suite',
    isInternal: true,
    isElectronics: false,
    rotationCapacity: 160,
    rotationEnergyCost: 0.07,
    maxAfterBurnerFuel: 5_000,
    afterBurnerCharge: 20,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};

export const dragonflyMK2Signals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 4,
    scanBaseDuration: 5,
};

export const dragonflyMK2Tube = {
    modelName: 'Stinger Missile Tube',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    bulletsPerSecond: 1,
    bulletSpeed: 1_000,
    bulletDegreesDeviation: 0,
    maxShellRange: 1_000_000,
    minShellRange: 1_000_000,
    overrideSecondsToLive: 10,
    energyCost: 30,
    use_HiExpShell: false,
    use_ArmPenShell: false,
    use_FragShell: false,
    use_HiExpMissile: false,
    use_ArmPenMissile: true,
    use_FragMissile: false,
    use_ClusterMissile: false,
    use_TandemMissile: false,
    use_ElecMissile: false,
    // fixed tube: it launches along the bearing it is fitted at
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 90,
};

export const dragonflyMK2 = {
    properties: dragonflyMK2Properties,
    chainGuns: [['FWD', dragonflyMK2Chaingun]],
    thrusters: [
        ['STBD', dragonflyMK2Thruster],
        ['PORT', dragonflyMK2Thruster],
        ['FWD', dragonflyMK2Thruster],
        ['AFT', dragonflyMK2Thruster],
    ],
    tubes: [['PORT', dragonflyMK2Tube]],
    radius: 11.2,
    armor: dragonflyMK2Armor,
    radars: [dragonflyMK2OmniRadar],
    smartPilot: dragonflyMK2SmartPilot,
    reactor: dragonflyMK2Reactor,
    magazine: dragonflyMK2Magazine,
    weaponsTarget: dragonflyMK2Targeting,
    warp: dragonflyMK2Warp,
    docking: dragonflyMK2Docking,
    maneuvering: dragonflyMK2Maneuvering,
    signals: dragonflyMK2Signals,
} satisfies ShipDesign;
