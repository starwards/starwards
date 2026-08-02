import { ShipDesign, ammoTypes, shipConfigurations } from '../src';

type MissileCounts = Partial<Record<(typeof ammoTypes)[number], number>>;

type HullExpectation = {
    key: string;
    coolant: number;
    plates: number;
    layers: Array<{ type: string; health: number; faraday?: boolean }>;
    speed: number;
    speedFromAfterBurner: number;
    turn: number;
    rotationCapacity: number;
    thrusters: number;
    thrusterCapacity: number;
    chainGun: { bps: number; maxRange: number; minRange: number; bulletSpeed: number } | null;
    shells: { HiExpShell: number; ArmPenShell: number; FragShell: number };
    tubes: number;
    missiles: MissileCounts;
    targeting: { maxRange: number; shortRange: number };
    radarRanges: number[];
    reactor: { perSecond: number; max: number };
    signalsJobs: number;
    warpSpeedPerLevel: number | null;
    dockingDistance: number;
};

const hulls: HullExpectation[] = [
    {
        key: 'dragonfly-MK1',
        coolant: 6,
        plates: 8,
        layers: [{ type: 'composite', health: 50 }],
        speed: 600,
        speedFromAfterBurner: 600,
        turn: 270,
        rotationCapacity: 205,
        thrusters: 4,
        thrusterCapacity: 300,
        chainGun: { bps: 8, maxRange: 4500, minRange: 500, bulletSpeed: 1000 },
        shells: { HiExpShell: 960, ArmPenShell: 480, FragShell: 800 },
        tubes: 0,
        missiles: {},
        targeting: { maxRange: 10_000, shortRange: 5_000 },
        radarRanges: [20_000, 30_000],
        reactor: { perSecond: 3, max: 500 },
        signalsJobs: 4,
        warpSpeedPerLevel: 800,
        dockingDistance: 1_000,
    },
    {
        key: 'dragonfly-MK2',
        coolant: 6,
        plates: 8,
        layers: [{ type: 'composite', health: 75 }],
        speed: 400,
        speedFromAfterBurner: 400,
        turn: 240,
        rotationCapacity: 160,
        thrusters: 4,
        thrusterCapacity: 300,
        chainGun: { bps: 14, maxRange: 4500, minRange: 500, bulletSpeed: 1000 },
        shells: { HiExpShell: 1_680, ArmPenShell: 840, FragShell: 1_400 },
        tubes: 1,
        missiles: { ArmPenMissile: 4 },
        targeting: { maxRange: 10_000, shortRange: 5_000 },
        radarRanges: [20_000],
        reactor: { perSecond: 3, max: 500 },
        signalsJobs: 4,
        warpSpeedPerLevel: 800,
        dockingDistance: 1_000,
    },
    {
        key: 'gravitas',
        coolant: 10,
        plates: 16,
        layers: [
            { type: 'whipple', health: 50 },
            { type: 'composite', health: 150 },
        ],
        speed: 450,
        speedFromAfterBurner: 600,
        turn: 108,
        rotationCapacity: 45,
        thrusters: 6,
        thrusterCapacity: 300,
        chainGun: { bps: 30, maxRange: 8_000, minRange: 500, bulletSpeed: 2_000 },
        shells: { HiExpShell: 3_600, ArmPenShell: 1_800, FragShell: 3_000 },
        tubes: 2,
        missiles: {
            ArmPenMissile: 20,
            HiExpMissile: 12,
            ClusterMissile: 4,
            FragMissile: 8,
            ElecMissile: 6,
            TandemMissile: 4,
        },
        targeting: { maxRange: 40_000, shortRange: 20_000 },
        radarRanges: [70_000, 50_000],
        reactor: { perSecond: 5, max: 1_000 },
        signalsJobs: 9,
        warpSpeedPerLevel: 1_000,
        dockingDistance: 1_000,
    },
    {
        key: 'predator',
        coolant: 10,
        plates: 16,
        layers: [
            { type: 'whipple', health: 50 },
            { type: 'composite', health: 150 },
        ],
        speed: 400,
        speedFromAfterBurner: 400,
        turn: 90,
        rotationCapacity: 45,
        thrusters: 6,
        thrusterCapacity: 250,
        chainGun: { bps: 30, maxRange: 7_500, minRange: 500, bulletSpeed: 2_000 },
        shells: { HiExpShell: 3_600, ArmPenShell: 1_800, FragShell: 3_000 },
        tubes: 2,
        missiles: { ArmPenMissile: 12, HiExpMissile: 8, TandemMissile: 2 },
        targeting: { maxRange: 40_000, shortRange: 20_000 },
        radarRanges: [70_000, 50_000],
        reactor: { perSecond: 5, max: 1_000 },
        signalsJobs: 9,
        warpSpeedPerLevel: 900,
        dockingDistance: 1_000,
    },
    {
        key: 'glaive',
        coolant: 16,
        plates: 24,
        layers: [{ type: 'composite', health: 175 }],
        speed: 300,
        speedFromAfterBurner: 300,
        turn: 60,
        rotationCapacity: 25,
        thrusters: 8,
        thrusterCapacity: 150,
        // main mount only (broadside PORT/STBD 180° mounts land as a single bolted mount pending #2041)
        chainGun: { bps: 20, maxRange: 8_000, minRange: 500, bulletSpeed: 2_000 },
        shells: { HiExpShell: 4_800, ArmPenShell: 2_400, FragShell: 4_000 },
        tubes: 2,
        missiles: { ArmPenMissile: 20, HiExpMissile: 6, TandemMissile: 2 },
        targeting: { maxRange: 40_000, shortRange: 20_000 },
        radarRanges: [100_000, 75_000],
        reactor: { perSecond: 8, max: 2_000 },
        signalsJobs: 12,
        warpSpeedPerLevel: 1_000,
        dockingDistance: 1_000,
    },
    {
        key: 'cataphract',
        coolant: 20,
        plates: 32,
        layers: [
            { type: 'hardened', health: 70 },
            { type: 'composite', health: 130 },
        ],
        speed: 175,
        speedFromAfterBurner: 175,
        turn: 54,
        rotationCapacity: 45,
        thrusters: 8,
        thrusterCapacity: 150,
        // main mount only (2x FWD 270° + 1x FWD 60°, 60 bps combined, land as a single bolted mount pending #2041)
        chainGun: { bps: 20, maxRange: 10_000, minRange: 500, bulletSpeed: 2_500 },
        shells: { HiExpShell: 7_200, ArmPenShell: 3_600, FragShell: 6_000 },
        tubes: 4,
        missiles: { ArmPenMissile: 20, HiExpMissile: 4, ElecMissile: 2, TandemMissile: 2 },
        targeting: { maxRange: 45_000, shortRange: 22_500 },
        radarRanges: [100_000, 75_000],
        reactor: { perSecond: 10, max: 3_000 },
        signalsJobs: 12,
        warpSpeedPerLevel: 1_000,
        dockingDistance: 1_000,
    },
    {
        key: 'freighter',
        coolant: 10,
        plates: 24,
        layers: [{ type: 'composite', health: 65 }],
        speed: 200,
        speedFromAfterBurner: 200,
        turn: 40,
        rotationCapacity: 25,
        thrusters: 6,
        thrusterCapacity: 100,
        chainGun: null,
        shells: { HiExpShell: 0, ArmPenShell: 0, FragShell: 0 },
        tubes: 0,
        missiles: {},
        targeting: { maxRange: 20_000, shortRange: 10_000 },
        radarRanges: [40_000],
        reactor: { perSecond: 5, max: 1_000 },
        signalsJobs: 4,
        warpSpeedPerLevel: 600,
        dockingDistance: 3_000,
    },
    {
        key: 'small-station',
        coolant: 24,
        plates: 36,
        layers: [
            { type: 'whipple', health: 40, faraday: true },
            { type: 'composite', health: 60 },
        ],
        speed: 0,
        speedFromAfterBurner: 0,
        turn: 0,
        rotationCapacity: 60,
        thrusters: 0,
        thrusterCapacity: 0,
        chainGun: null,
        shells: { HiExpShell: 0, ArmPenShell: 0, FragShell: 0 },
        tubes: 0,
        missiles: {},
        targeting: { maxRange: 20_000, shortRange: 10_000 },
        radarRanges: [120_000, 100_000],
        reactor: { perSecond: 12, max: 4_000 },
        signalsJobs: 16,
        warpSpeedPerLevel: null,
        dockingDistance: 3_000,
    },
    {
        key: 'chaingun-platform',
        coolant: 24,
        plates: 36,
        layers: [
            { type: 'hardened', health: 60, faraday: true },
            { type: 'composite', health: 120 },
        ],
        speed: 0,
        speedFromAfterBurner: 0,
        turn: 45,
        rotationCapacity: 60,
        thrusters: 0,
        thrusterCapacity: 0,
        chainGun: { bps: 40, maxRange: 12_000, minRange: 2_400, bulletSpeed: 2_500 },
        shells: { HiExpShell: 4_800, ArmPenShell: 2_400, FragShell: 4_000 },
        tubes: 0,
        missiles: {},
        targeting: { maxRange: 20_000, shortRange: 10_000 },
        radarRanges: [120_000, 100_000],
        reactor: { perSecond: 12, max: 4_000 },
        signalsJobs: 16,
        warpSpeedPerLevel: null,
        dockingDistance: 3_000,
    },
    {
        key: 'large-station',
        coolant: 24,
        plates: 36,
        layers: [
            { type: 'hardened', health: 80, faraday: true },
            { type: 'composite', health: 120 },
        ],
        speed: 0,
        speedFromAfterBurner: 0,
        turn: 0,
        rotationCapacity: 60,
        thrusters: 0,
        thrusterCapacity: 0,
        chainGun: null,
        shells: { HiExpShell: 0, ArmPenShell: 0, FragShell: 0 },
        tubes: 0,
        missiles: {},
        targeting: { maxRange: 20_000, shortRange: 10_000 },
        radarRanges: [120_000, 100_000],
        reactor: { perSecond: 12, max: 4_000 },
        signalsJobs: 16,
        warpSpeedPerLevel: null,
        dockingDistance: 3_000,
    },
];

describe('ship roster MVP hull configurations (issue #2042)', () => {
    test.each(hulls)('$key matches the spec table', (hull) => {
        const design = shipConfigurations[hull.key as keyof typeof shipConfigurations] as ShipDesign;
        expect(design).toBeTruthy();

        expect(design.properties.systemKillRatio).toBe(0.5);
        expect(design.properties.totalCoolant).toBe(hull.coolant);

        expect(design.armor.numberOfPlates).toBe(hull.plates);
        expect(design.armor.layers).toHaveLength(hull.layers.length);
        hull.layers.forEach((layer, i) => {
            expect(design.armor.layers[i].type).toBe(layer.type);
            expect(design.armor.layers[i].plateMaxHealth).toBe(layer.health);
            expect(!!design.armor.layers[i].withFaradayLayer).toBe(!!layer.faraday);
        });
        expect(design.armor.layers.at(-1)?.type).toBe('composite');

        expect(design.smartPilot.maxSpeed).toBe(hull.speed);
        expect(design.smartPilot.maxSpeedFromAfterBurner).toBe(hull.speedFromAfterBurner);
        expect(design.smartPilot.maxTurnSpeed).toBe(hull.turn);
        expect(design.maneuvering.rotationCapacity).toBe(hull.rotationCapacity);

        expect(design.thrusters).toHaveLength(hull.thrusters);
        for (const [, thrusterDesign] of design.thrusters) {
            expect(thrusterDesign.capacity).toBe(hull.thrusterCapacity);
        }

        if (hull.chainGun) {
            expect(design.chainGun).toBeTruthy();
            expect(design.chainGun?.bulletsPerSecond).toBe(hull.chainGun.bps);
            expect(design.chainGun?.maxShellRange).toBe(hull.chainGun.maxRange);
            expect(design.chainGun?.minShellRange).toBe(hull.chainGun.minRange);
            expect(design.chainGun?.bulletSpeed).toBe(hull.chainGun.bulletSpeed);
        } else {
            expect(design.chainGun).toBeNull();
        }

        expect(design.magazine.max_HiExpShell).toBe(hull.shells.HiExpShell);
        expect(design.magazine.max_ArmPenShell).toBe(hull.shells.ArmPenShell);
        expect(design.magazine.max_FragShell).toBe(hull.shells.FragShell);
        for (const ammo of ammoTypes) {
            if (ammo.endsWith('Missile')) {
                const expected = hull.missiles[ammo] ?? 0;
                expect(design.magazine[`max_${ammo}`]).toBe(expected);
            }
        }

        expect(design.tubes).toHaveLength(hull.tubes);
        for (const [bearing] of design.tubes) {
            expect(['PORT', 'STBD']).toContain(bearing);
        }

        expect(design.weaponsTarget.maxRange).toBe(hull.targeting.maxRange);
        expect(design.weaponsTarget.shortRange).toBe(hull.targeting.shortRange);
        expect(design.weaponsTarget.shortRange).toBe(design.weaponsTarget.maxRange * 0.5);

        expect(design.radars).toHaveLength(hull.radarRanges.length);
        hull.radarRanges.forEach((range, i) => {
            expect(design.radars[i].range).toBe(range);
        });

        expect(design.reactor.energyPerSecond).toBe(hull.reactor.perSecond);
        expect(design.reactor.maxEnergy).toBe(hull.reactor.max);

        expect(design.signals.maxJobs).toBe(hull.signalsJobs);

        if (hull.warpSpeedPerLevel === null) {
            expect(design.warp).toBeNull();
        } else {
            expect(design.warp?.speedPerLevel).toBe(hull.warpSpeedPerLevel);
        }

        expect(design.docking.maxDockingDistance).toBe(hull.dockingDistance);
    });

    test('all 10 MVP hulls are registered', () => {
        const rosterKeys = hulls.map((h) => h.key);
        for (const key of rosterKeys) {
            expect(Object.keys(shipConfigurations)).toContain(key);
        }
        expect(rosterKeys).toHaveLength(10);
    });
});
