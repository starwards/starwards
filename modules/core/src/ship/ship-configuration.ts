export type ShipDirectionConfig = 'FWD' | 'STBD' | 'AFT' | 'PORT';

export type RadarDesign = {
    damage50: number;
    basicRange: number;
    rangeEaseFactor: number;
    malfunctionRange: number;
};
export type ThrusterDesign = {
    maxAngleError: number;
    capacity: number;
    energyCost: number;
    speedFactor: number;
    afterBurnerCapacity: number;
    afterBurnerEffectFactor: number;
    damage50: number;
    completeDestructionProbability: number;
};
export type ChaingunDesign = {
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
export type ReactorDesign = {
    energyPerSecond: number;
    maxEnergy: number;
    maxAfterBurnerFuel: number;
    afterBurnerCharge: number;
    afterBurnerEnergyCost: number;
    damage50: number;
};

export type ShipPropertiesDesign = {
    rotationCapacity: number;
    rotationEnergyCost: number;
    maxChainGunAmmo: number;
};

export type ShipDesign = {
    properties: ShipPropertiesDesign;
    chainGun: ChaingunDesign | null;
    thrusters: [ShipDirectionConfig, ThrusterDesign][];
    armor: ArmorDesign;
    radar: RadarDesign;
    smartPilot: SmartPilotDesign;
    reactor: ReactorDesign;
};

export type ArmorDesign = {
    numberOfPlates: number;
    healRate: number;
    plateMaxHealth: number;
};

export type SmartPilotDesign = {
    maxTargetAimOffset: number;
    aimOffsetSpeed: number;
    maxTurnSpeed: number;
    offsetBrokenThreshold: number;
    damage50: number;
    maxSpeed: number;
    maxSpeedFromAfterBurner: number;
};
