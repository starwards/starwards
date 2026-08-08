import { MockDie, makeIterationsData } from './ship-test-harness';
import { ShipManagerPc, SpaceManager, Spaceship, getSystems, gravitas, makeShipState } from '../src';

import { expect } from 'chai';

/**
 * Regression test for #2121: an idle player ship must be heat-stable at boot. Default power
 * (NORMAL) plus the default zero coolant allocation must never accumulate heat, damage systems,
 * or drain energy on a ship nobody is touching.
 *
 * The first few ticks are a one-time settle window: weapons pre-load their default ammo on spawn
 * (`ChainGunManager`'s `switchToAvailableAmmo` + the `loadAmmo` default of `true` — deliberate,
 * covered by `ammo-manager.spec.ts`, so weapons are combat-ready without extra crew action) and
 * that draws a bounded, self-recovering burst of stored energy. The idle-equilibrium invariant
 * this test guards is about the steady state afterwards, not that one-time startup cost.
 */
describe('idle ship stability (#2121)', () => {
    it('a gravitas ship left idle for 10 sim-minutes never degrades', () => {
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'gravitas-1';
        shipObj.radius = gravitas.radius;
        const state = makeShipState(shipObj.id, gravitas);
        spaceMgr.insert(shipObj);
        const shipMgr = new ShipManagerPc(shipObj, state, spaceMgr, new MockDie());

        const startDefectibles = getSystems(state).flatMap((s) =>
            s.defectibles.map((d) => ({ pointer: s.pointer, field: d.field, value: d.value })),
        );
        const startArmor = state.armor.armorPlates.map((p) => p.layers.map((l) => l.health));
        const startEnergy = state.reactor.energy;

        const SETTLE_TICKS = 5;
        let prevEnergy = state.reactor.energy;
        let tick = 0;
        const iterations = makeIterationsData(600, 600); // 600 x 1s ticks = 10 sim-minutes
        for (const id of iterations) {
            shipMgr.update(id);
            spaceMgr.update(id);
            tick++;

            for (const system of state.systems()) {
                expect(system.broken, `${system.name} broke while idle`).to.equal(false);
                expect(system.heat, `${system.name} accumulated heat while idle`).to.equal(0);
            }
            if (tick > SETTLE_TICKS) {
                expect(state.reactor.energy, 'stored energy decreased while idle').to.be.at.least(prevEnergy - 1e-6);
            }
            prevEnergy = state.reactor.energy;
        }
        // the one-time weapon pre-load settle burst must stay small and self-recovering, not an
        // open-ended drain
        expect(state.reactor.energy, 'idle equilibrium left the ship worse off than it started').to.be.at.least(
            startEnergy - 1e-6,
        );

        const endDefectibles = getSystems(state).flatMap((s) =>
            s.defectibles.map((d) => ({ pointer: s.pointer, field: d.field, value: d.value })),
        );
        expect(endDefectibles).to.deep.equal(startDefectibles);

        const endArmor = state.armor.armorPlates.map((p) => p.layers.map((l) => l.health));
        expect(endArmor).to.deep.equal(startArmor);
    });
});
