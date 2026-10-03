import { DamageManager, DamageReport, SpaceManager, Spaceship, damageProfiles, demoShip, makeShipState } from '../src';

import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

function setUp() {
    const ship = new Spaceship();
    ship.id = 'victim';
    const state = makeShipState(ship.id, demoShip);
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const die = new MockDie();
    die.expectedRoll = 0;
    const damageManager = new DamageManager(ship, state, spaceManager, die);
    const reports: DamageReport[] = [];
    damageManager.onDamage = (report) => reports.push(report);
    return { state, damageManager, reports };
}

const plateHealth = (state: ReturnType<typeof makeShipState>) =>
    [...state.armor.armorPlates].reduce((s, p) => s + [...p.layers].reduce((t, l) => t + l.health, 0), 0);

describe('DamageManager.onDamage', () => {
    it("reports a weapon hit's shooter, warhead, armor it stripped and the defects it caused", () => {
        const { state, damageManager, reports } = setUp();
        const before = plateHealth(state);
        damageManager.takeWeaponDamage({
            id: 'shell-1',
            amount: 30,
            damageSurfaceArc: [0, 0.01],
            damageDurationSeconds: 0.05,
            damageType: 'ArmPen',
            delivery: 'impact',
            shipId: 'shooter',
            profile: damageProfiles.ArmPen,
        });
        expect(reports).to.have.length(1);
        const [r] = reports;
        expect(r).to.include({ shooterId: 'shooter', damageType: 'ArmPen', delivery: 'impact', amount: 30 });
        expect(r.plateLoss).to.be.closeTo(before - plateHealth(state), 1e-6);
        expect(r.plateLoss).to.be.greaterThan(0);
        expect(r.defects).to.be.a('number');
    });
});
