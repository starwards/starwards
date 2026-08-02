import { ShipDesign } from '../ship';

export const predatorArmor = {
    numberOfPlates: 16,
    layers: [
        { type: 'whipple' as const, plateMaxHealth: 50 },
        { type: 'composite' as const, plateMaxHealth: 150 },
    ],
};

export const predatorThruster = {
    modelName: 'RT-250 Vectored Thruster',
    isInternal: false,
    isElectronics: false,
    maxBearingSkew: 45,
    capacity: 250,
    energyCost: 0.07,
    afterBurnerCapacity: 250,
    damage50: 15,
};

export const predatorOmniRadar = {
    modelName: 'Argus-70k Phased Radar',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 70_000,
    minArc: 360,
    maxArc: 360,
    defaultArc: 360,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 35_000,
    turnSpeed: 0,
};

export const predatorScanBeam = {
    modelName: 'Lancet-50 Directional Scan Beam',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 50_000,
    minArc: 5,
    maxArc: 90,
    defaultArc: 20,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 25_000,
    turnSpeed: 30,
};

export const predatorChaingun = {
    modelName: 'Hailstorm 30RPS Chaingun',
    isInternal: false,
    isElectronics: true,
    bulletsPerSecond: 30,
    bulletSpeed: 2_000,
    bulletDegreesDeviation: 1,
    maxShellRange: 7_500,
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
    maxBearingSkew: 90,
};

export const predatorReactor = {
    modelName: 'Helios-1000 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 5,
    maxEnergy: 1_000,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
};

export const predatorProperties = {
    modelName: 'Predator',
    totalCoolant: 10,
    systemKillRatio: 0.5,
};

export const predatorMagazine = {
    modelName: 'Talon Mk-II Magazine',
    isInternal: true,
    isElectronics: true,
    max_HiExpShell: 3_600,
    max_ArmPenShell: 1_800,
    max_FragShell: 3_000,
    max_HiExpMissile: 8,
    max_ArmPenMissile: 12,
    max_FragMissile: 0,
    max_ClusterMissile: 0,
    max_TandemMissile: 2,
    max_ElecMissile: 0,
    damage50: 20,
    capacityBrokenThreshold: 0.15,
    capacityDamageFactor: 0.1,
};

export const predatorSmartPilot = {
    modelName: 'Nimbus-9 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 90,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 400,
    // stock hull: no afterburner speed bonus
    maxSpeedFromAfterBurner: 400,
};

export const predatorTargeting = {
    modelName: 'Raptor Targeting Computer',
    maxRange: 40_000,
    shortRange: 20_000,
};

export const predatorWarp = {
    modelName: 'Voyager-X Warp Drive',
    isInternal: true,
    isElectronics: true,
    damage50: 20,
    maxProximity: 10_000,
    chargeTime: 10,
    dechargeTime: 5,
    speedPerLevel: 900,
    energyCostPerLevel: 2,
    damagePerPhysicalSpeed: 20,
    baseDamagePerWarpSpeedPerSecond: 0.1,
    secondsToChangeFrequency: 10,
};

export const predatorDocking = {
    modelName: 'Gripper-2 Docking Clamp',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxDockingDistance: 1_000,
    maxDockedDistance: 20,
    undockingTargetDistance: 100,
    angle: -90,
    width: 45,
};

export const predatorManeuvering = {
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

export const predatorSignals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 9,
    scanBaseDuration: 5,
};

export const predatorTube = {
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
    maxBearingSkew: 90,
};

export const predator = {
    properties: predatorProperties,
    chainGuns: [['FWD', predatorChaingun]],
    thrusters: [
        ['STBD', predatorThruster],
        ['PORT', predatorThruster],
        ['FWD', predatorThruster],
        ['FWD', predatorThruster],
        ['AFT', predatorThruster],
        ['AFT', predatorThruster],
    ],
    tubes: [
        ['PORT', predatorTube],
        ['STBD', predatorTube],
    ],
    armor: predatorArmor,
    radars: [predatorOmniRadar, predatorScanBeam],
    smartPilot: predatorSmartPilot,
    reactor: predatorReactor,
    magazine: predatorMagazine,
    weaponsTarget: predatorTargeting,
    warp: predatorWarp,
    docking: predatorDocking,
    maneuvering: predatorManeuvering,
    signals: predatorSignals,
} satisfies ShipDesign;
