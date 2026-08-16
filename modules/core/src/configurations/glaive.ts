import { ShipDesign } from '../ship';

export const glaiveArmor = {
    numberOfPlates: 24,
    layers: [{ type: 'composite' as const, plateMaxHealth: 175 }],
};

export const glaiveThruster = {
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

export const glaiveOmniRadar = {
    modelName: 'Argus-100k Phased Radar',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 100_000,
    minArc: 360,
    maxArc: 360,
    defaultArc: 360,
    energyCost: 0.038,
    rangeEaseFactor: 0.2,
    malfunctionRange: 2_000,
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 0,
};

export const glaiveScanBeam = {
    modelName: 'Lancet-75 Directional Scan Beam',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 75_000,
    minArc: 5,
    maxArc: 90,
    defaultArc: 20,
    energyCost: 0.038,
    rangeEaseFactor: 0.2,
    malfunctionRange: 2_000,
    turnSpeed: 30,
    bearingLimit: 180,
    maxBearingSkew: 45,
};

/** Broadside mount: fitted PORT and STBD, each sweeping 180° centred on its own beam. */
export const glaiveChaingun = {
    modelName: 'Hailstorm 20RPS Chaingun',
    isInternal: false,
    isElectronics: true,
    bulletsPerSecond: 20,
    bulletSpeed: 2_000,
    bulletDegreesDeviation: 1,
    maxShellRange: 8_000,
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
    energyCost: 0.11,
    turnSpeed: 30,
    maxBearingSkew: 90,
    bearingLimit: 90,
};

export const glaiveReactor = {
    modelName: 'Helios-2000 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 8,
    maxEnergy: 2_000,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
    maxEnergyCells: 2,
};

export const glaiveProperties = {
    modelName: 'Glaive',
    totalCoolant: 16,
    systemKillRatio: 0.5,
};

export const glaiveMagazine = {
    modelName: 'Warhawk Magazine',
    isInternal: true,
    isElectronics: true,
    max_HiExpShell: 4_800,
    max_ArmPenShell: 2_400,
    max_FragShell: 4_000,
    max_HiExpMissile: 6,
    max_ArmPenMissile: 20,
    max_FragMissile: 0,
    max_ClusterMissile: 0,
    max_TandemMissile: 2,
    max_ElecMissile: 0,
    damage50: 20,
    capacityBrokenThreshold: 0.15,
    capacityDamageFactor: 0.1,
};

export const glaiveSmartPilot = {
    modelName: 'Nimbus-6 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 60,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 300,
    maxSpeedFromAfterBurner: 300,
};

export const glaiveTargeting = {
    modelName: 'Raptor Targeting Computer',
    maxRange: 40_000,
    shortRange: 20_000,
};

export const glaiveWarp = {
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

export const glaiveDocking = {
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

export const glaiveManeuvering = {
    modelName: 'Pivot-25 Maneuvering Suite',
    isInternal: true,
    isElectronics: false,
    rotationCapacity: 25,
    rotationEnergyCost: 0.07,
    maxAfterBurnerFuel: 5_000,
    afterBurnerCharge: 20,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};

export const glaiveSignals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 12,
    scanBaseDuration: 5,
};

export const glaiveTube = {
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
    use_ElecMissile: false,
    // fixed tube: it launches along the bearing it is fitted at
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 90,
};

export const glaive = {
    properties: glaiveProperties,
    chainGuns: [
        ['PORT', glaiveChaingun],
        ['STBD', glaiveChaingun],
    ],
    thrusters: [
        ['STBD', glaiveThruster],
        ['STBD', glaiveThruster],
        ['PORT', glaiveThruster],
        ['PORT', glaiveThruster],
        ['FWD', glaiveThruster],
        ['FWD', glaiveThruster],
        ['AFT', glaiveThruster],
        ['AFT', glaiveThruster],
    ],
    tubes: [
        ['PORT', glaiveTube],
        ['STBD', glaiveTube],
    ],
    radius: 33.6,
    armor: glaiveArmor,
    radars: [glaiveOmniRadar, glaiveScanBeam],
    smartPilot: glaiveSmartPilot,
    reactor: glaiveReactor,
    magazine: glaiveMagazine,
    weaponsTarget: glaiveTargeting,
    warp: glaiveWarp,
    docking: glaiveDocking,
    maneuvering: glaiveManeuvering,
    signals: glaiveSignals,
} satisfies ShipDesign;
