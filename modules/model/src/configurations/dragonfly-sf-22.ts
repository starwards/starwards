import { ShipModel } from '../ship/ship-configuration';

export const dragonflyArmor = {
    numberOfPlates: 60,
    healRate: 3.3333,
    plateMaxHealth: 200,
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
export const dragonflyProperties = {
    energyPerSecond: 5,
    maxEnergy: 1000,
    maxAfterBurner: 5000,
    afterBurnerCharge: 20,
    afterBurnerEnergyCost: 0.07,
    rotationCapacity: 25,
    rotationEnergyCost: 0.07,
    maxSpeeFromAfterBurner: 300,
    numberOfShipRegions: 2,
    maxChainGunAmmo: 3600,
};
export const dragonflySmartPilot = {
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    maxTurnSpeed: 90,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 300,
};
export const dragonflySF22: ShipModel = {
    properties: dragonflyProperties,
    chainGun: dragonflyChaingun,
    thrusters: [
        { angle: 'STBD', ...dragonflyThruster },
        { angle: 'PORT', ...dragonflyThruster },
        { angle: 'FWD', ...dragonflyThruster },
        { angle: 'FWD', ...dragonflyThruster },
        { angle: 'AFT', ...dragonflyThruster },
        { angle: 'AFT', ...dragonflyThruster },
    ],
    armor: dragonflyArmor,
    radar: dragonflyRadar,
    smartPilot: dragonflySmartPilot,
};
