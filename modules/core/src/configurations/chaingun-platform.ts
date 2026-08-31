import { ShipDesign } from '../ship';

export const chaingunPlatformArmor = {
    numberOfPlates: 36,
    layers: [
        { type: 'hardened' as const, plateMaxHealth: 12.5, withFaradayLayer: true },
        { type: 'composite' as const, plateMaxHealth: 25 },
    ],
};

export const chaingunPlatformOmniRadar = {
    modelName: 'Argus-120k Phased Radar',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 120_000,
    minArc: 360,
    maxArc: 360,
    defaultArc: 360,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 2_000,
    turnSpeed: 0,
    bearingLimit: 0,
    maxBearingSkew: 0,
};

export const chaingunPlatformScanBeam = {
    modelName: 'Lancet-100 Directional Scan Beam',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    range: 100_000,
    minArc: 5,
    maxArc: 90,
    defaultArc: 20,
    energyCost: 0.05,
    rangeEaseFactor: 0.2,
    malfunctionRange: 2_000,
    turnSpeed: 30,
    bearingLimit: 180,
    maxBearingSkew: 45,
};

/**
 * The deliberate hole: minShellRange stays the platform's own 2,400m (not the roster-wide flat
 * 500m) — closing inside it is how a crew beats a static emplacement.
 */
export const chaingunPlatformChaingun = {
    modelName: 'Hailstorm 40RPS Chaingun',
    isInternal: false,
    isElectronics: true,
    bulletsPerSecond: 40,
    bulletSpeed: 2_500,
    bulletDegreesDeviation: 1,
    maxShellRange: 12_000,
    minShellRange: 2_400,
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
    // bearingLimit 180 covers the full 360°: the mount alone tracks its target, the hull never turns.
    turnSpeed: 45,
    bearingLimit: 180,
    maxBearingSkew: 90,
};

export const chaingunPlatformReactor = {
    modelName: 'Helios-4000 Fusion Reactor',
    isInternal: true,
    isElectronics: true,
    energyPerSecond: 12,
    maxEnergy: 4_000,
    energyHeatEPMThreshold: 20,
    energyHeat: 0.5,
    damage50: 20,
    maxEnergyCells: 2,
};

export const chaingunPlatformProperties = {
    modelName: 'Chaingun Platform',
    totalCoolant: 24,
    systemKillRatio: 0.6,
};

export const chaingunPlatformMagazine = {
    modelName: 'Bastion Magazine',
    isInternal: true,
    isElectronics: true,
    max_HiExpShell: 4_800,
    max_ArmPenShell: 2_400,
    max_FragShell: 4_000,
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

export const chaingunPlatformSmartPilot = {
    modelName: 'Nimbus-4 Smart Pilot',
    isInternal: true,
    isElectronics: true,
    maxTargetAimOffset: 30,
    aimOffsetSpeed: 15,
    // no thrusters, no movement order ever issued to this hull -- only relevant if that changes
    maxTurnSpeed: 45,
    offsetBrokenThreshold: 0.6,
    damage50: 90,
    maxSpeed: 0,
    maxSpeedFromAfterBurner: 0,
};

export const chaingunPlatformTargeting = {
    modelName: 'Falcon Targeting Computer',
    maxRange: 20_000,
    shortRange: 10_000,
};

export const chaingunPlatformDocking = {
    modelName: 'Gripper-3 Docking Clamp',
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxDockingDistance: 3_000,
    maxDockedDistance: 20,
    undockingTargetDistance: 100,
    angle: -90,
    width: 45,
    isDockingHost: true,
};

export const chaingunPlatformManeuvering = {
    modelName: 'Pivot-60 Maneuvering Suite',
    isInternal: true,
    isElectronics: false,
    rotationCapacity: 60,
    rotationEnergyCost: 0.07,
    maxAfterBurnerFuel: 0,
    afterBurnerCharge: 0,
    afterBurnerEnergyCost: 0.07,
    damage50: 20,
};

export const chaingunPlatformSignals = {
    isInternal: false,
    isElectronics: true,
    damage50: 20,
    maxJobs: 16,
    scanBaseDuration: 5,
};

export const chaingunPlatform = {
    properties: chaingunPlatformProperties,
    chainGuns: [['FWD', chaingunPlatformChaingun]],
    thrusters: [],
    tubes: [],
    radius: 800,
    armor: chaingunPlatformArmor,
    radars: [chaingunPlatformOmniRadar, chaingunPlatformScanBeam],
    smartPilot: chaingunPlatformSmartPilot,
    reactor: chaingunPlatformReactor,
    magazine: chaingunPlatformMagazine,
    weaponsTarget: chaingunPlatformTargeting,
    // stations don't warp
    warp: null,
    docking: chaingunPlatformDocking,
    maneuvering: chaingunPlatformManeuvering,
    signals: chaingunPlatformSignals,
} satisfies ShipDesign;
