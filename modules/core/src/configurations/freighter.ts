import { ShipDesign } from '../ship';

export const freighterArmor = {
    numberOfPlates: 24,
    layers: [{ type: 'composite' as const, plateMaxHealth: 65 }],
};

export const freighterThruster = {
    modelName: 'RT-100 Vectored Thruster',
    isInternal: false,
    isElectronics: false,
    maxBearingSkew: 45,
    capacity: 100,
    energyCost: 0.07,
    afterBurnerCapacity: 100,
    damage50: 15,
};

export const freighterOmniRadar = {
    modelName: 'Argus-40k Phased Radar',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 40_000,
    minArc: 360,
    maxArc: 360,
    defaultArc: 360,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 20_000,
    turnSpeed: 0,
};

export const freighterReactor = {
    modelName: 'Helios-1000 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 5,
    maxEnergy: 1_000,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
};

export const freighterProperties = {
    modelName: 'Freighter',
    totalCoolant: 10,
    systemKillRatio: 0.5,
};

export const freighterMagazine = {
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

export const freighterSmartPilot = {
    modelName: 'Nimbus-3 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 40,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 200,
    maxSpeedFromAfterBurner: 200,
};

export const freighterTargeting = {
    modelName: 'Falcon Targeting Computer',
    maxRange: 20_000,
    shortRange: 10_000,
};

export const freighterWarp = {
    modelName: 'Voyager-X Warp Drive',
    isInternal: true,
    isElectronics: true,
    damage50: 20,
    maxProximity: 10_000,
    chargeTime: 10,
    dechargeTime: 5,
    speedPerLevel: 600,
    energyCostPerLevel: 2,
    damagePerPhysicalSpeed: 20,
    baseDamagePerWarpSpeedPerSecond: 0.1,
    secondsToChangeFrequency: 10,
};

export const freighterDocking = {
    modelName: 'Gripper-3 Docking Clamp',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxDockingDistance: 3_000,
    maxDockedDistance: 20,
    undockingTargetDistance: 100,
    angle: -90,
    width: 45,
};

export const freighterManeuvering = {
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

export const freighterSignals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 4,
    scanBaseDuration: 5,
};

export const freighter = {
    properties: freighterProperties,
    chainGuns: [],
    thrusters: [
        ['STBD', freighterThruster],
        ['PORT', freighterThruster],
        ['FWD', freighterThruster],
        ['FWD', freighterThruster],
        ['AFT', freighterThruster],
        ['AFT', freighterThruster],
    ],
    tubes: [],
    armor: freighterArmor,
    radars: [freighterOmniRadar],
    smartPilot: freighterSmartPilot,
    reactor: freighterReactor,
    magazine: freighterMagazine,
    weaponsTarget: freighterTargeting,
    warp: freighterWarp,
    docking: freighterDocking,
    maneuvering: freighterManeuvering,
    signals: freighterSignals,
} satisfies ShipDesign;
