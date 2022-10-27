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
    overrideSecondsToLive: 0,
    explosionRadius: 10,
    explosionExpansionSpeed: 40,
    explosionDamageFactor: 20,
    explosionBlastFactor: 1,
    damage50: 20,
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
};
export const dragonflyMagazine = {
    maxCannonShells: 3600,
    damage50: 20,
    capacityBrokenThreshold: 0.15,
    capacityDamageFactor: 0.1,
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
export const dragonflyTube = {
    damage50: 20,
    bulletsPerSecond: 1 / 5,
    bulletSpeed: 300,
    // chaingun only properties
    bulletDegreesDeviation: 0,
    maxShellRange: Number.MAX_VALUE,
    minShellRange: Number.MAX_VALUE,
    overrideSecondsToLive: 10,
    // ammo properties
    explosionRadius: 100,
    explosionExpansionSpeed: 100,
    explosionDamageFactor: 20,
    explosionBlastFactor: 1,
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
};
