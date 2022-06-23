export type ShipDirectionConfig = 'FWD' | 'STBD' | 'AFT' | 'PORT';

export type RadarModel = {
    damage50: number;
    basicRange: number;
    rangeEaseFactor: number;
    malfunctionRange: number;
};
export type ThrusterModel = {
    angle: ShipDirectionConfig;
    maxAngleError: number;
    capacity: number;
    energyCost: number;
    speedFactor: number;
    afterBurnerCapacity: number;
    afterBurnerEffectFactor: number;
    damage50: number;
    completeDestructionProbability: number;
};
export type ChaingunModel = {
    bulletsPerSecond: number;
    bulletSpeed: number;
    bulletDegreesDeviation: number;
    maxShellRange: number;
    minShellRange: number;
    shellRangeAim: number;
    explosionRadius: number;
    explosionExpansionSpeed: number;
    explosionDamageFactor: number;
    explosionBlastFactor: number;
    damage50: number;
    completeDestructionProbability: number;
};

export type ShipPropertiesModel = {
    energyPerSecond: number;
    maxEnergy: number;
    maxAfterBurner: number;
    afterBurnerCharge: number;
    afterBurnerEnergyCost: number;
    rotationCapacity: number;
    rotationEnergyCost: number;
    maxSpeeFromAfterBurner: number;
    numberOfShipRegions: number;
    maxChainGunAmmo: number;
};

export type ShipModel = {
    properties: ShipPropertiesModel;
    chainGun: ChaingunModel;
    thrusters: ThrusterModel[];
    armor: ArmorModel;
    radar: RadarModel;
    smartPilot: SmartPilotModel;
};

export type ArmorModel = {
    numberOfPlates: number;
    healRate: number;
    plateMaxHealth: number;
};

export type SmartPilotModel = {
    maxTargetAimOffset: number;
    aimOffsetSpeed: number;
    maxTurnSpeed: number;
    offsetBrokenThreshold: number;
    maxSpeed: number;
    damage50: number;
};
