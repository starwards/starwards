import { ShipDesign } from '../ship';

export const dragonflyArmor = {
    numberOfPlates: 12,
    // fighter-class plates: sized so a standard ArmPen missile (60 flat × plateDamage_ArmPen 2
    // = 120 erosion) breaches a plate in one direct hit
    layers: [{ type: 'composite' as const, plateMaxHealth: 100 }],
};

export const dragonflyThruster = {
    modelName: 'RT-150 Vectored Thruster',
    isInternal: false,
    isElectronics: false,
    maxAngleError: 45,
    capacity: 150,
    energyCost: 0.07,
    afterBurnerCapacity: 300,
    damage50: 15,
};
export const dragonflyOmniRadar = {
    modelName: 'Argus-10k Phased Radar',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 10_000,
    // fixed omni sweep: the arc cannot be traded for reach
    minArc: 360,
    maxArc: 360,
    defaultArc: 360,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 5_000,
    // the omni sweeps every bearing at once, so its mount has nothing to turn
    turnSpeed: 0,
};
export const dragonflyScanBeam = {
    modelName: 'Lancet-20 Directional Scan Beam',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    // 20,000m reach when fitted at its 20deg arc; widened to 90deg it reaches ~9,400m
    range: 20_000,
    minArc: 5,
    maxArc: 90,
    defaultArc: 20,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 10_000,
    // a full sweep from bow to stern takes 6 seconds at full effectiveness
    turnSpeed: 30,
};
export const dragonflyChaingun = {
    modelName: 'Hailstorm 20RPS Chaingun',
    isInternal: false,
    isElectronics: true,
    bulletsPerSecond: 20,
    bulletSpeed: 1000,
    bulletDegreesDeviation: 1,
    maxShellRange: 5000,
    minShellRange: 1000,
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
};
export const dragonflyReactor = {
    modelName: 'Helios-1000 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 5,
    maxEnergy: 1000,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
};
export const dragonflyProperties = {
    modelName: 'Dragonfly SF-22 Frame',
    totalCoolant: 10,
    systemKillRatio: 0.5,
};
export const dragonflyMagazine = {
    modelName: 'Hornet Mk-II Magazine',
    isInternal: true,
    isElectronics: true,
    max_HiExpShell: 2400,
    max_ArmPenShell: 1200,
    max_FragShell: 2000,
    max_HiExpMissile: 12,
    max_ArmPenMissile: 6,
    max_FragMissile: 8,
    max_ClusterMissile: 6,
    max_TandemMissile: 4,
    max_ElecMissile: 4,
    damage50: 20,
    capacityBrokenThreshold: 0.15,
    capacityDamageFactor: 0.1,
};
export const dragonflySmartPilot = {
    modelName: 'Nimbus-3 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 90,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 300,
    maxSpeedFromAfterBurner: 300,
};
export const dragonflyTube = {
    modelName: 'Stinger Missile Tube',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    bulletsPerSecond: 1,
    bulletSpeed: 1000,
    // chaingun only properties
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
    use_FragMissile: true,
    use_ClusterMissile: true,
    use_TandemMissile: true,
    use_ElecMissile: true,
    // fixed tube: it launches along the bearing it is fitted at
    turnSpeed: 0,
};
export const dragonflyTargeting = {
    modelName: 'Falcon Targeting Computer',
    maxRange: 5_000,
    shortRange: 3_000,
};
export const dragonflyWarp = {
    modelName: 'Voyager-X Warp Drive',
    isInternal: true,
    isElectronics: true,
    damage50: 20,
    maxProximity: 10_000,
    chargeTime: 10,
    dechargeTime: 5,
    speedPerLevel: 1000,
    energyCostPerLevel: 2,
    damagePerPhysicalSpeed: 20,
    baseDamagePerWarpSpeedPerSecond: 0.1,
    secondsToChangeFrequency: 10,
};
export const dragonflyDocking = {
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
export const dragonflyManeuvering = {
    modelName: 'Pivot-25 Maneuvering Suite',
    isInternal: true,
    isElectronics: false,
    rotationCapacity: 25,
    rotationEnergyCost: 0.07,
    maxAfterBurnerFuel: 5000,
    afterBurnerCharge: 20,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};

export const dragonflySignals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 9,
    scanBaseDuration: 5,
};

export const dragonflySF22 = {
    properties: dragonflyProperties,
    chainGun: dragonflyChaingun,
    thrusters: [
        ['STBD', dragonflyThruster],
        ['PORT', dragonflyThruster],
        ['FWD', dragonflyThruster],
        ['FWD', dragonflyThruster],
        ['AFT', dragonflyThruster],
        ['AFT', dragonflyThruster],
    ],
    tubes: [['AFT', dragonflyTube]],
    armor: dragonflyArmor,
    radars: [dragonflyOmniRadar, dragonflyScanBeam],
    smartPilot: dragonflySmartPilot,
    reactor: dragonflyReactor,
    magazine: dragonflyMagazine,
    weaponsTarget: dragonflyTargeting,
    warp: dragonflyWarp,
    docking: dragonflyDocking,
    maneuvering: dragonflyManeuvering,
    signals: dragonflySignals,
} satisfies ShipDesign;
