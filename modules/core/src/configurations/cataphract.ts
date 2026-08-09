import { ShipDesign } from '../ship';

export const cataphractArmor = {
    numberOfPlates: 32,
    layers: [
        { type: 'hardened' as const, plateMaxHealth: 70 },
        { type: 'composite' as const, plateMaxHealth: 130 },
    ],
};

export const cataphractThruster = {
    modelName: 'RT-150 Vectored Thruster',
    isInternal: false,
    isElectronics: false,
    bearingLimit: 0,
    maxBearingSkew: 45,
    capacity: 150,
    energyCost: 0.07,
    afterBurnerCapacity: 150,
    damage50: 15,
};

export const cataphractOmniRadar = {
    modelName: 'Argus-100k Phased Radar',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 100_000,
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

export const cataphractScanBeam = {
    modelName: 'Lancet-75 Directional Scan Beam',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 75_000,
    minArc: 5,
    maxArc: 90,
    defaultArc: 20,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 2_000,
    turnSpeed: 30,
    bearingLimit: 180,
    maxBearingSkew: 45,
};

/** Main battery: fitted forward, sweeping 270° — blind only in a 90° cone astern. */
export const cataphractChaingun = {
    modelName: 'Hailstorm 20RPS Chaingun',
    isInternal: false,
    isElectronics: true,
    bulletsPerSecond: 20,
    bulletSpeed: 2_500,
    bulletDegreesDeviation: 1,
    maxShellRange: 10_000,
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
    turnSpeed: 30,
    maxBearingSkew: 90,
    bearingLimit: 135,
};

/** Chin mount: same gun on a narrow 60° forward arc, for close-in work dead ahead. */
export const cataphractChinChaingun = {
    ...cataphractChaingun,
    bearingLimit: 30,
};

export const cataphractReactor = {
    modelName: 'Helios-3000 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 10,
    maxEnergy: 3_000,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
};

export const cataphractProperties = {
    modelName: 'Cataphract',
    totalCoolant: 20,
    systemKillRatio: 0.5,
};

export const cataphractMagazine = {
    modelName: 'Bastion Magazine',
    isInternal: true,
    isElectronics: true,
    max_HiExpShell: 7_200,
    max_ArmPenShell: 3_600,
    max_FragShell: 6_000,
    max_HiExpMissile: 4,
    max_ArmPenMissile: 20,
    max_FragMissile: 0,
    max_ClusterMissile: 0,
    max_TandemMissile: 2,
    max_ElecMissile: 2,
    damage50: 20,
    capacityBrokenThreshold: 0.15,
    capacityDamageFactor: 0.1,
};

export const cataphractSmartPilot = {
    modelName: 'Nimbus-5 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 54,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 175,
    maxSpeedFromAfterBurner: 175,
};

export const cataphractTargeting = {
    modelName: 'Raptor Targeting Computer',
    maxRange: 45_000,
    shortRange: 22_500,
};

export const cataphractWarp = {
    modelName: 'Voyager-X Warp Drive',
    isInternal: true,
    isElectronics: true,
    damage50: 20,
    maxProximity: 10_000,
    chargeTime: 10,
    dechargeTime: 5,
    speedPerLevel: 1_000,
    energyCostPerLevel: 2,
    damagePerPhysicalSpeed: 20,
    baseDamagePerWarpSpeedPerSecond: 0.1,
    secondsToChangeFrequency: 10,
};

export const cataphractDocking = {
    modelName: 'Gripper-2 Docking Clamp',
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

export const cataphractManeuvering = {
    modelName: 'Pivot-45 Maneuvering Suite',
    isInternal: true,
    isElectronics: false,
    rotationCapacity: 45,
    rotationEnergyCost: 0.07,
    maxAfterBurnerFuel: 5_000,
    afterBurnerCharge: 20,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};

export const cataphractSignals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 12,
    scanBaseDuration: 5,
};

export const cataphractTube = {
    modelName: 'Harpoon Missile Tube',
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
    use_HiExpMissile: true,
    use_ArmPenMissile: true,
    use_FragMissile: false,
    use_ClusterMissile: false,
    use_TandemMissile: true,
    use_ElecMissile: true,
    // fixed tube: it launches along the bearing it is fitted at
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 90,
};

export const cataphract = {
    properties: cataphractProperties,
    chainGuns: [
        ['FWD', cataphractChaingun],
        ['FWD', cataphractChaingun],
        ['FWD', cataphractChinChaingun],
    ],
    thrusters: [
        ['STBD', cataphractThruster],
        ['STBD', cataphractThruster],
        ['PORT', cataphractThruster],
        ['PORT', cataphractThruster],
        ['FWD', cataphractThruster],
        ['FWD', cataphractThruster],
        ['AFT', cataphractThruster],
        ['AFT', cataphractThruster],
    ],
    tubes: [
        ['PORT', cataphractTube],
        ['PORT', cataphractTube],
        ['STBD', cataphractTube],
        ['STBD', cataphractTube],
    ],
    radius: 44.8,
    armor: cataphractArmor,
    radars: [cataphractOmniRadar, cataphractScanBeam],
    smartPilot: cataphractSmartPilot,
    reactor: cataphractReactor,
    magazine: cataphractMagazine,
    weaponsTarget: cataphractTargeting,
    warp: cataphractWarp,
    docking: cataphractDocking,
    maneuvering: cataphractManeuvering,
    signals: cataphractSignals,
} satisfies ShipDesign;
