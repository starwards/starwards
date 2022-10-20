import { ShipDesign } from '../ship';

export const dragonflyArmor = {
    numberOfPlates: 12,
    healRate: 3,
    plateMaxHealth: 1500,
};
export const dragonflyThruster = {
    maxAngleError: 45,
    capacity: 50,
    energyCost: 0.07,
    speedFactor: 3,
    afterBurnerCapacity: 300,
    afterBurnerEffectFactor: 1,
    damage50: 15,
    completeDestructionProbability: 0.1,
};
export const dragonflyRadar = {
    damage50: 20,
    basicRange: 3_000,
    rangeEaseFactor: 0.2,
    malfunctionRange: 1_500,
};
export const dragonflyChaingun = {
    bulletsPerSecond: 20,
    bulletSpeed: 1000,
    bulletDegreesDeviation: 1,
    maxShellRange: 5000,
    minShellRange: 1000,
    shellRangeAim: 1000,
    explosionRadius: 10,
    explosionExpansionSpeed: 40,
    explosionDamageFactor: 20,
    explosionBlastFactor: 1,
    damage50: 20,
    completeDestructionProbability: 0.1,
};
export const dragonflyReactor = {
    energyPerSecond: 5,
    maxEnergy: 1000,
    maxAfterBurnerFuel: 5000,
    afterBurnerCharge: 20,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};
export const dragonflyProperties = {
    rotationCapacity: 25,
    rotationEnergyCost: 0.07,
    maxChainGunAmmo: 3600,
};
export const dragonflySmartPilot = {
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 90,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 300,
    maxSpeedFromAfterBurner: 300,
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
    armor: dragonflyArmor,
    radar: dragonflyRadar,
    smartPilot: dragonflySmartPilot,
    reactor: dragonflyReactor,
};
