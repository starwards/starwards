import { ShipDesign } from '../ship';

export const dragonflyArmor = {
    modelName: 'Aegis-12 Plated Armor',
    numberOfPlates: 12,
    healRate: 3,
    plateMaxHealth: 1500,
    armorType: 'Composite' as const,
    hasFaradayLayer: false,
};
export const dragonflyThruster = {
    modelName: 'RT-150 Vectored Thruster',
    maxAngleError: 45,
    capacity: 150,
    energyCost: 0.07,
    afterBurnerCapacity: 300,
    damage50: 15,
};
export const dragonflyRadar = {
    modelName: 'Argus-10k Phased Radar',
    damage50: 20,
    range: 10_000,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 5_000,
};
export const dragonflyChaingun = {
    modelName: 'Hailstorm 20RPS Chaingun',
    bulletsPerSecond: 20,
    bulletSpeed: 1000,
    bulletDegreesDeviation: 1,
    maxShellRange: 5000,
    minShellRange: 1000,
    overrideSecondsToLive: 0,
    use_CannonHe: true,
    use_CannonAp: true,
    use_CannonFrag: true,
    damage50: 20,
    energyCost: 1,
    heat_CannonHe: 5,
    heat_CannonAp: 5,
    heat_CannonFrag: 5,
};
export const dragonflyReactor = {
    modelName: 'Helios-1000 Fusion Reactor',
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
    // 3 cannon ammo types — bulk shells, plus a smaller AP reserve.
    max_CannonHe: 2400,
    max_CannonAp: 1200,
    max_CannonFrag: 2000,
    // 5 missile types — generalist HE bias, with smaller specialist stocks.
    max_MissileHe: 12,
    max_MissileSabot: 6,
    max_MissileCluster: 6,
    max_MissileTandem: 4,
    max_MissileEmp: 4,
    damage50: 20,
    capacityBrokenThreshold: 0.15,
    capacityDamageFactor: 0.1,
};
export const dragonflySmartPilot = {
    modelName: 'Nimbus-3 Smart Pilot',
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
    damage50: 20,
    bulletsPerSecond: 1,
    bulletSpeed: 1000,
    // chaingun only properties
    bulletDegreesDeviation: 0,
    maxShellRange: 1_000_000,
    minShellRange: 1_000_000,
    overrideSecondsToLive: 10,
    energyCost: 30,
    use_MissileHe: true,
    use_MissileSabot: true,
    use_MissileCluster: true,
    use_MissileTandem: true,
    use_MissileEmp: true,
    heat_MissileHe: 25,
    heat_MissileSabot: 25,
    heat_MissileCluster: 25,
    heat_MissileTandem: 25,
    heat_MissileEmp: 25,
};
export const dragonflyTargeting = {
    modelName: 'Falcon Targeting Computer',
    maxRange: 5_000,
    shortRange: 3_000,
};
export const dragonflyWarp = {
    modelName: 'Voyager-X Warp Drive',
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
    damage50: 20,
    maxDockingDistance: 1_000,
    maxDockedDistance: 20,
    undockingTargetDistance: 100,
    angle: -90,
    width: 45,
};
export const dragonflyManeuvering = {
    modelName: 'Pivot-25 Maneuvering Suite',
    rotationCapacity: 25,
    rotationEnergyCost: 0.07,
    maxAfterBurnerFuel: 5000,
    afterBurnerCharge: 20,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};

export const dragonflySignals = {
    damage50: 20,
    maxJobs: 9,
    maxTrackedTargets: 3,
    scanBaseDuration: 20,
    scanAdvancedFactor: 2,
    hackBaseDuration: 45,
    hackEffectDuration: 150,
    hackCooldown: 60,
    scanBaseSuccessRate: 0.8,
    hackBaseSuccessRate: 0.6,
};

export const dragonflySF22: ShipDesign = {
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
    radar: dragonflyRadar,
    smartPilot: dragonflySmartPilot,
    reactor: dragonflyReactor,
    magazine: dragonflyMagazine,
    weaponsTarget: dragonflyTargeting,
    warp: dragonflyWarp,
    docking: dragonflyDocking,
    maneuvering: dragonflyManeuvering,
    signals: dragonflySignals,
};
