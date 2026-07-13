import { AmmoType, WarheadDesign, damageProfiles, dragonflySF22, projectileDesigns } from '../src';

import { DamageType, SystemScope } from '../src/space/damage-profile';
import { expect } from 'chai';

// One table-driven pin for the whole §8 ammo catalog: every delivery, scope, concentration,
// damage/damageFactor, blast size, flight characteristic, fuze, heat and magazine number. A
// deliberate retune is a deliberate edit to this table.

const blastSize = (e: { expansionSpeed: number; secondsToLive: number }) => e.expansionSpeed * e.secondsToLive;

type Fuze = 'contact' | 'proximity';

interface WarheadRow {
    label: string;
    warhead: WarheadDesign;
    type: DamageType;
    delivery: 'impact' | 'explosion';
    scope: SystemScope;
    concentration: number;
    // exactly one of the two applies (impact carries a flat damage, explosion a per-second factor)
    impactDamage?: number;
    damageFactor?: number;
    blast?: number;
}

const cluster = projectileDesigns.ClusterMissile;

// §8 warhead table (delivery, scope, concentration, damage/damageFactor, blast per round)
const warheadRows: WarheadRow[] = [
    { label: 'HiExpShell', warhead: projectileDesigns.HiExpShell, type: 'HiExp', delivery: 'explosion', scope: 'multi', concentration: 1, damageFactor: 20, blast: 200 }, // prettier-ignore
    { label: 'ArmPenShell', warhead: projectileDesigns.ArmPenShell, type: 'ArmPen', delivery: 'impact', scope: 'single', concentration: 1, impactDamage: 30 }, // prettier-ignore
    { label: 'FragShell', warhead: projectileDesigns.FragShell, type: 'Frag', delivery: 'explosion', scope: 'multi', concentration: 1, damageFactor: 10, blast: 250 }, // prettier-ignore
    { label: 'HiExpMissile', warhead: projectileDesigns.HiExpMissile, type: 'HiExp', delivery: 'explosion', scope: 'multi', concentration: 1, damageFactor: 50, blast: 350 }, // prettier-ignore
    { label: 'ArmPenMissile', warhead: projectileDesigns.ArmPenMissile, type: 'ArmPen', delivery: 'impact', scope: 'single', concentration: 8, impactDamage: 60 }, // prettier-ignore
    { label: 'FragMissile', warhead: projectileDesigns.FragMissile, type: 'Frag', delivery: 'explosion', scope: 'multi', concentration: 1, damageFactor: 10, blast: 800 }, // prettier-ignore
    { label: 'Cluster-Frag', warhead: cluster.warheads.Frag, type: 'Frag', delivery: 'explosion', scope: 'multi', concentration: 1, damageFactor: 10, blast: 750 }, // prettier-ignore
    { label: 'Cluster-AP', warhead: cluster.warheads.ArmPen, type: 'ArmPen', delivery: 'impact', scope: 'multi', concentration: 3, impactDamage: 30 }, // prettier-ignore
    { label: 'TandemMissile', warhead: projectileDesigns.TandemMissile, type: 'Tandem', delivery: 'impact', scope: 'single', concentration: 5, impactDamage: 50 }, // prettier-ignore
    { label: 'ElecMissile', warhead: projectileDesigns.ElecMissile, type: 'Elec', delivery: 'impact', scope: 'electronics', concentration: 1, impactDamage: 25 }, // prettier-ignore
];

// effective scope = the warhead's own override, else the damage type's profile scope
const effectiveScope = (w: WarheadRow): SystemScope => w.warhead.systemScope ?? damageProfiles[w.type].systemScope;

describe('§8 ammo catalog (regression pins)', () => {
    describe('warhead table', () => {
        for (const row of warheadRows) {
            it(`${row.label}: ${row.type}, ${row.delivery}, ${row.scope}, conc ${row.concentration}`, () => {
                expect(row.warhead.damageType).to.equal(row.type);
                expect(row.warhead.delivery).to.equal(row.delivery);
                expect(effectiveScope(row)).to.equal(row.scope);
                expect(row.warhead.concentration).to.equal(row.concentration);
                if (row.delivery === 'impact') {
                    expect(row.warhead.impactDamage).to.equal(row.impactDamage);
                } else {
                    // explosion: per-second damage factor + blast size (expansionSpeed x secondsToLive)
                    expect(row.warhead.explosion.damageFactor).to.equal(row.damageFactor);
                    expect(blastSize(row.warhead.explosion)).to.equal(row.blast);
                }
            });
        }
    });

    // §8 missile flight table (max speed, turn rate, flight time, fuze). Explosion missiles are
    // proximity-fuzed (100m), impact missiles contact-fuzed.
    interface FlightRow {
        model: AmmoType;
        maxSpeed: number;
        turnRate: number;
        flightTime: number;
        fuze: Fuze;
    }
    const flightRows: FlightRow[] = [
        { model: 'HiExpMissile', maxSpeed: 600, turnRate: 720, flightTime: 78, fuze: 'proximity' },
        { model: 'ArmPenMissile', maxSpeed: 960, turnRate: 504, flightTime: 42, fuze: 'contact' },
        { model: 'FragMissile', maxSpeed: 600, turnRate: 720, flightTime: 78, fuze: 'proximity' },
        { model: 'ClusterMissile', maxSpeed: 600, turnRate: 720, flightTime: 78, fuze: 'proximity' }, // default Frag mode
        { model: 'TandemMissile', maxSpeed: 420, turnRate: 936, flightTime: 60, fuze: 'contact' },
        { model: 'ElecMissile', maxSpeed: 780, turnRate: 720, flightTime: 96, fuze: 'contact' },
    ];

    describe('missile flight table', () => {
        for (const row of flightRows) {
            it(`${row.model}: ${row.maxSpeed} speed / ${row.turnRate} turn / ${row.flightTime}s / ${row.fuze}`, () => {
                const homing = projectileDesigns[row.model].homing;
                expect(homing, 'is a missile').to.not.equal(null);
                expect(homing!.maxSpeed).to.equal(row.maxSpeed);
                expect(homing!.velocityCapacity).to.equal(row.maxSpeed);
                expect(homing!.rotationCapacity).to.equal(row.turnRate);
                expect(homing!.secondsToLive).to.equal(row.flightTime);
                // fuze: explosion delivery detonates at 100m proximity; impact is contact-fuzed
                const impliedFuze: Fuze =
                    projectileDesigns[row.model].delivery === 'explosion' ? 'proximity' : 'contact';
                expect(impliedFuze).to.equal(row.fuze);
                if (impliedFuze === 'proximity') {
                    expect(homing!.proximityDetonation).to.equal(100);
                }
            });
        }
    });

    it('Cluster AP mode is contact-fuzed (impact delivery), Frag mode proximity', () => {
        expect(cluster.warheads.ArmPen.delivery).to.equal('impact');
        expect(cluster.warheads.Frag.delivery).to.equal('explosion');
    });

    it('heat per shot: 5 for shells, 25 for missiles', () => {
        for (const model of Object.keys(projectileDesigns) as AmmoType[]) {
            const design = projectileDesigns[model];
            expect(design.heatPerShot, model).to.equal(design.homing ? 25 : 5);
        }
    });

    it('Dragonfly magazine counts (§8)', () => {
        const mag = dragonflySF22.magazine;
        expect(mag.max_HiExpShell).to.equal(2400);
        expect(mag.max_ArmPenShell).to.equal(1200);
        expect(mag.max_FragShell).to.equal(2000);
        expect(mag.max_HiExpMissile).to.equal(12);
        expect(mag.max_ArmPenMissile).to.equal(6);
        expect(mag.max_FragMissile).to.equal(8);
        expect(mag.max_ClusterMissile).to.equal(6);
        expect(mag.max_TandemMissile).to.equal(4);
        expect(mag.max_ElecMissile).to.equal(4);
    });
});
