import { cmdReceivers, getSystems, gmShipCommands, magazineStocks } from '../src';
import { ShipTestHarness } from './ship-test-harness';
import { expect } from 'chai';
import { isFieldLocked } from '../src/lock-registry';

const { gmResupply, gmRepair } = gmShipCommands;

function depleted() {
    const harness = new ShipTestHarness();
    const { shipState } = harness;
    for (const at of magazineStocks) {
        shipState.magazine.setCount(at, 0);
    }
    shipState.reactor.energy = 0;
    shipState.reactor.energyCells = 0;
    shipState.maneuvering.afterBurnerFuel = 0;
    return harness;
}

function damaged() {
    const harness = new ShipTestHarness();
    const { shipState } = harness;
    for (const plate of shipState.armor.armorPlates) {
        for (const layer of plate.layers) {
            layer.health = 0;
        }
    }
    shipState.reactor.effeciencyFactor = 0.2;
    shipState.capsule.integrity = 0.3;
    return harness;
}

describe('GM ship quick actions', () => {
    describe('resupply', () => {
        it('refills ammo, energy, energy cells and afterburner fuel to their maxima', () => {
            const { shipState } = depleted();
            expect(shipState.reactor.design.maxEnergy).to.be.greaterThan(0);
            expect(shipState.maneuvering.design.maxAfterBurnerFuel).to.be.greaterThan(0);
            gmResupply.setValue(shipState);
            for (const at of magazineStocks) {
                expect(shipState.magazine.getCount(at)).to.equal(shipState.magazine.getMax(at));
            }
            expect(magazineStocks.some((at) => shipState.magazine.getMax(at) > 0)).to.equal(true);
            expect(shipState.reactor.energy).to.equal(shipState.reactor.design.maxEnergy);
            expect(shipState.reactor.energyCells).to.equal(shipState.reactor.design.maxEnergyCells);
            expect(shipState.maneuvering.afterBurnerFuel).to.equal(shipState.maneuvering.design.maxAfterBurnerFuel);
        });

        it('leaves armor and system defects alone', () => {
            const { shipState } = damaged();
            gmResupply.setValue(shipState);
            expect(shipState.reactor.effeciencyFactor).to.be.closeTo(0.2, 1e-6);
            expect(shipState.armor.armorPlates[0].layers[0].health).to.equal(0);
            expect(shipState.capsule.integrity).to.be.closeTo(0.3, 1e-6);
        });

        it('writes through a GM-locked field', () => {
            const harness = depleted();
            harness.shipState.lockCommands.push({ path: '/reactor/energy', locked: true });
            harness.shipMgr.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });
            expect(isFieldLocked(harness.shipState.reactor, 'energy')).to.equal(true);
            gmResupply.setValue(harness.shipState);
            expect(harness.shipState.reactor.energy).to.equal(harness.shipState.reactor.design.maxEnergy);
            // the lock is back on afterwards
            expect(isFieldLocked(harness.shipState.reactor, 'energy')).to.equal(true);
        });
    });

    describe('repair', () => {
        it('restores every armor layer, the capsule and every defectible system factor', () => {
            const { shipState } = damaged();
            expect(getSystems(shipState).some((s) => s.getStatus() === 'DAMAGED')).to.equal(true);
            gmRepair.setValue(shipState);
            for (const plate of shipState.armor.armorPlates) {
                for (const layer of plate.layers) {
                    expect(layer.health).to.equal(layer.maxHealth);
                }
            }
            for (const system of getSystems(shipState)) {
                for (const d of system.defectibles) {
                    expect((system.state as unknown as Record<string, number>)[d.field]).to.equal(d.normal);
                }
                expect(system.state.broken).to.equal(false);
            }
            expect(shipState.capsule.integrity).to.equal(1);
        });

        it('leaves ammo, energy and fuel alone', () => {
            const { shipState } = depleted();
            gmRepair.setValue(shipState);
            expect(shipState.reactor.energy).to.equal(0);
            expect(shipState.maneuvering.afterBurnerFuel).to.equal(0);
            expect(shipState.magazine.getCount(magazineStocks[0])).to.equal(0);
        });
    });

    it('is reachable as ship-room messages named gmResupply and gmRepair', () => {
        const harness = depleted();
        const receivers = new Map(cmdReceivers(gmShipCommands, harness.shipMgr));
        expect([...receivers.keys()].sort()).to.eql(['gmRepair', 'gmResupply']);
        receivers.get('gmResupply')!(undefined, { value: undefined, path: undefined });
        expect(harness.shipState.reactor.energy).to.equal(harness.shipState.reactor.design.maxEnergy);
    });
});
