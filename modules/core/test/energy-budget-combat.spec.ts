import { MockDie, makeIterationsData } from './ship-test-harness';
import { PowerLevel, ShipManagerPc, SmartPilotMode, SpaceManager, Spaceship, gravitas, makeShipState } from '../src';
import { MAX_SYSTEM_HEAT } from '../src/ship/heat-manager';

import { expect } from 'chai';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

/**
 * Regression test for #2187: testplay reported a single Corvette-vs-fighter fight needing roughly
 * five GM energy refills. Gravitas is the roster's corvette-class hull (#2042 size ladder: fighter 8
 * plates -> corvette 16), so it stands in for the reported "Corvette" here.
 *
 * The chain gun runs at NORMAL, not MAX: #2305 anchors a system's own energy (and, since heat scales
 * with what a system draws, thermal) cost at ×1 at NORMAL and makes it rise above that — sustained
 * MAX-power gunfire is deliberately no longer energy/heat neutral, so it would no longer belong in a
 * "does this stay within budget" regression. The reactor stays at MAX: its own above-NORMAL heat
 * cost (#2278) is a separate concern from a drawing system's #2305 cost and still applies here.
 */
function makeFiringGravitas() {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'gravitas-1';
    shipObj.radius = gravitas.radius;
    const state = makeShipState(shipObj.id, gravitas);
    spaceMgr.insert(shipObj);
    const shipMgr = new ShipManagerPc(shipObj, state, spaceMgr, new MockDie());
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

    state.reactor.power = PowerLevel.MAX;
    // above NORMAL the reactor heats by what it generates, like a drawing system by what it draws
    state.reactor.coolantFactor = 1;
    const chainGun = state.chainGuns[0];
    chainGun.power = PowerLevel.NORMAL;
    chainGun.coolantFactor = 1;
    chainGun.isFiring = true;
    chainGun.loadAmmo = true;
    switchToAvailableAmmo(chainGun, state.magazine);
    const tick = (id: Parameters<typeof shipMgr.update>[0]) => {
        shipMgr.update(id);
        spaceMgr.update(id);
    };
    return { state, chainGun, tick };
}

describe('energy budget under sustained weapons fire (#2187)', () => {
    it('a cooled gravitas at max reactor power does not drain its reserve firing its chaingun continuously at 60 Hz', () => {
        const { state, chainGun, tick } = makeFiringGravitas();
        const startEnergy = state.reactor.energy;
        // real server tick rate; stop at overheat (#2313: sustained fire overheats by design) so
        // the reserve is judged over the whole burst the gun can actually deliver
        for (const id of makeIterationsData(60, 60 * 60, () => chainGun.heat >= MAX_SYSTEM_HEAT)) {
            tick(id);
        }

        expect(
            state.reactor.energy,
            'reactor drained from sustained gunfire at normal power instead of staying roughly net-positive',
        ).to.be.at.least(startEnergy * 0.95);
    });
});

describe('chain gun sustained fire (#2313)', () => {
    it('a fully cooled gravitas chaingun at normal power overheats after ~10 s of continuous fire at 60 Hz', () => {
        const { chainGun, tick } = makeFiringGravitas();
        let overheatAt = Infinity;
        for (const id of makeIterationsData(30, 30 * 60)) {
            tick(id);
            if (chainGun.heat >= MAX_SYSTEM_HEAT) {
                overheatAt = id.totalSeconds;
                break;
            }
        }
        expect(overheatAt, 'seconds of continuous fire to overheat').to.be.within(9, 11);
    });
});
