import {
    Armor,
    Projectile,
    ShipDesign,
    ShipManagerNpc,
    ShipModel,
    SpaceManager,
    Spaceship,
    Vec2,
    demoShip,
    makeShipState,
    shipConfigurations,
} from '../src';

import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

/**
 * Regression coverage for issue #2236: a blast's armor damage was an integral of how long the
 * (possibly still-moving, still-growing) cloud geometrically overlapped the hull -- a function of
 * shell speed and target diameter, not of the warhead. These tests pin the fixed property instead:
 * one detonation, one flat per-plate damage figure derived from the warhead's `damageFactor`,
 * applied once per target regardless of dwell time or hull size.
 */

const TICK_SECONDS = 0.01;
const STANDOFF = 1500; // metres of clear flight before the target, for every fixture below
const TAIL_SECONDS = 3; // ticks to run after the shell should have detonated, to flush the blast

function totalArmorHealth(armor: Armor): number {
    let sum = 0;
    for (const plate of armor.armorPlates) {
        for (const layer of plate.layers) {
            sum += layer.health;
        }
    }
    return sum;
}

function perPlateHealth(armor: Armor): number[] {
    return [...armor.armorPlates].map((plate) => plate.layers.reduce((s, l) => s + l.health, 0));
}

/** one stationary target, built from a real hull config (or a custom one) at the origin */
function makeTarget(hull: ShipModel | ShipDesign, id = 'target') {
    const config = typeof hull === 'string' ? shipConfigurations[hull] : hull;
    const ship = new Spaceship();
    ship.id = id;
    ship.radius = config.radius;
    ship.position = Vec2.make({ x: 0, y: 0 });
    ship.velocity = Vec2.make({ x: 0, y: 0 });
    const spaceMgr = new SpaceManager();
    const shipMgr = new ShipManagerNpc(ship, makeShipState(id, config), spaceMgr, new MockDie());
    spaceMgr.insert(ship);
    spaceMgr.forceFlushEntities();
    return { spaceMgr, ship, shipMgr };
}

/** fires exactly one shell at the target, straight in along the x axis, and lets it play out */
function fireOneShell(
    spaceMgr: SpaceManager,
    shipMgr: ShipManagerNpc,
    ship: Spaceship,
    ammo: 'HiExpShell' | 'FragShell' | 'ArmPenShell' | 'HiExpMissile',
    speed: number,
) {
    const shell = new Projectile(ammo);
    shell.velocity = Vec2.make({ x: speed, y: 0 });
    shell.init('the-shell', Vec2.make({ x: -(STANDOFF + ship.radius), y: 0 }));
    if (shell.design.homing) {
        shell.targetId = ship.id; // guided warheads only proximity-fuze against a tracked target
    }
    const flightSeconds = STANDOFF / speed;
    shell.secondsToLive = flightSeconds + 5;
    spaceMgr.insert(shell);
    spaceMgr.forceFlushEntities();

    const totalTicks = Math.ceil((flightSeconds + TAIL_SECONDS) / TICK_SECONDS);
    for (let i = 0; i < totalTicks; i++) {
        const id = { deltaSeconds: TICK_SECONDS, deltaSecondsAvg: TICK_SECONDS, totalSeconds: TICK_SECONDS * (i + 1) };
        spaceMgr.update(id);
        shipMgr.update(id);
    }
}

// a plate large enough that one detonation's flat per-plate figure never breaches it --
// isolates the property under test (per-plate erosion) from breach/exposure side effects
const compositeHullAt = (radius: number): ShipDesign => ({
    ...demoShip,
    radius,
    armor: { numberOfPlates: 8, layers: [{ type: 'composite', plateMaxHealth: 1000 }] },
});

describe('blast armor damage is a property of the warhead (issue #2236)', () => {
    describe('property 1: independent of shell speed', () => {
        it('HiExpShell deals the same total armor damage to a given hull at 100, 500 and 2000 m/s', () => {
            const totals = [100, 500, 2000].map((speed) => {
                const { spaceMgr, ship, shipMgr } = makeTarget('large-station');
                const before = totalArmorHealth(shipMgr.state.armor);
                fireOneShell(spaceMgr, shipMgr, ship, 'HiExpShell', speed);
                const lost = before - totalArmorHealth(shipMgr.state.armor);
                expect(lost, `speed ${speed}`).to.be.greaterThan(0);
                return lost;
            });
            const [slow, medium, fast] = totals;
            expect(fast / slow, 'fast vs slow').to.be.closeTo(1, 0.1);
            expect(medium / slow, 'medium vs slow').to.be.closeTo(1, 0.1);
        });
    });

    describe('property 2: independent of target diameter (same outer-layer model)', () => {
        it('HiExpShell deals the same per-plate armor damage on hull radii 11, 22, 500 and 1200m', () => {
            const radii = [11.2, 22.4, 500, 1200];
            const perPlateAmounts = radii.map((radius) => {
                const { spaceMgr, ship, shipMgr } = makeTarget(compositeHullAt(radius));
                const before = perPlateHealth(shipMgr.state.armor);
                fireOneShell(spaceMgr, shipMgr, ship, 'HiExpShell', 2000);
                const after = perPlateHealth(shipMgr.state.armor);
                const touchedLosses = before.map((h, i) => h - after[i]).filter((loss) => loss > 0.01);
                expect(touchedLosses.length, `radius ${radius}: at least one plate touched`).to.be.greaterThan(0);
                const avg = touchedLosses.reduce((a, b) => a + b, 0) / touchedLosses.length;
                for (const loss of touchedLosses) {
                    expect(loss, `radius ${radius}: every touched plate takes the same amount`).to.be.closeTo(
                        avg,
                        avg * 0.05,
                    );
                }
                return avg;
            });
            const [r11, r22, r500, r1200] = perPlateAmounts;
            for (const amount of [r22, r500, r1200]) {
                expect(amount / r11, 'per-plate amount vs the 11m hull').to.be.closeTo(1, 0.2);
            }
        });
    });

    describe('property 3: total per-detonation damage is bounded, not a function of dwell time', () => {
        it('running the simulation far past detonation does not keep eroding armor', () => {
            const { spaceMgr, ship, shipMgr } = makeTarget('large-station');
            const before = totalArmorHealth(shipMgr.state.armor);
            fireOneShell(spaceMgr, shipMgr, ship, 'HiExpShell', 500);
            const justAfter = totalArmorHealth(shipMgr.state.armor);
            expect(justAfter, 'the shell should have hit').to.be.lessThan(before);

            // several extra seconds with nothing left in flight: a dwell-time integral would have
            // kept applying damage for as long as anything overlapped; a bounded detonation does not
            for (let i = 0; i < 500; i++) {
                const id = { deltaSeconds: TICK_SECONDS, deltaSecondsAvg: TICK_SECONDS, totalSeconds: TICK_SECONDS };
                spaceMgr.update(id);
                shipMgr.update(id);
            }
            expect(totalArmorHealth(shipMgr.state.armor)).to.equal(justAfter);
        });
    });

    describe('property 4: HiExp per-plate erosion preserves the whipple:hardened:composite 0.25:0.5:1 ratio end-to-end', () => {
        it('through the real space-manager path, not only at the resolution layer', () => {
            const cases: Array<{ hull: ShipModel; factor: number }> = [
                { hull: 'gravitas', factor: 0.25 }, // outer layer: whipple
                { hull: 'large-station', factor: 0.5 }, // outer layer: hardened
                { hull: 'dragonfly-MK1', factor: 1 }, // outer layer: composite
            ];
            const damageFactor = 20; // HiExpShell warhead, spec §8
            for (const { hull, factor } of cases) {
                const { spaceMgr, ship, shipMgr } = makeTarget(hull);
                const before = perPlateHealth(shipMgr.state.armor);
                fireOneShell(spaceMgr, shipMgr, ship, 'HiExpShell', 2000);
                const after = perPlateHealth(shipMgr.state.armor);
                const touchedLosses = before.map((h, i) => h - after[i]).filter((loss) => loss > 0.01);
                expect(touchedLosses.length, `${hull}: at least one plate touched`).to.be.greaterThan(0);
                for (const loss of touchedLosses) {
                    expect(loss, `${hull}: per-plate erosion`).to.be.closeTo(
                        damageFactor * factor,
                        damageFactor * factor * 0.1,
                    );
                }
            }
        });
    });

    describe('property 5: HiExp deals non-zero armor damage on the smallest hulls at catalog speed', () => {
        for (const hull of ['dragonfly-MK1', 'gravitas'] as const) {
            it(`${hull} at 2000 m/s`, () => {
                const { spaceMgr, ship, shipMgr } = makeTarget(hull);
                const before = totalArmorHealth(shipMgr.state.armor);
                fireOneShell(spaceMgr, shipMgr, ship, 'HiExpShell', 2000);
                expect(totalArmorHealth(shipMgr.state.armor)).to.be.lessThan(before);
            });
        }

        it('HiExpMissile also reaches a dragonfly-MK1 at catalog homing speed, same one-detonation property', () => {
            const { spaceMgr, ship, shipMgr } = makeTarget('dragonfly-MK1');
            const before = totalArmorHealth(shipMgr.state.armor);
            fireOneShell(spaceMgr, shipMgr, ship, 'HiExpMissile', 600);
            expect(totalArmorHealth(shipMgr.state.armor)).to.be.lessThan(before);
        });
    });

    describe('property 6: unaffected weapon behaviors (regression guards)', () => {
        it('FragShell still erodes zero plates on every armor model', () => {
            for (const hull of ['dragonfly-MK1', 'gravitas', 'large-station'] as const) {
                const { spaceMgr, ship, shipMgr } = makeTarget(hull);
                const before = totalArmorHealth(shipMgr.state.armor);
                fireOneShell(spaceMgr, shipMgr, ship, 'FragShell', 1000);
                expect(totalArmorHealth(shipMgr.state.armor), hull).to.equal(before);
            }
        });

        it('ArmPenShell still spawns no explosion and hits exactly one plate', () => {
            const { spaceMgr, ship, shipMgr } = makeTarget('large-station');
            const before = perPlateHealth(shipMgr.state.armor);
            fireOneShell(spaceMgr, shipMgr, ship, 'ArmPenShell', 1000);
            expect([...spaceMgr.state.getAll('Explosion')]).to.have.lengthOf(0);
            const after = perPlateHealth(shipMgr.state.armor);
            const touchedPlates = before.filter((h, i) => h - after[i] > 0.01).length;
            expect(touchedPlates).to.equal(1);
        });
    });
});
