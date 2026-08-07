import {
    RepairProtocolStats,
    getAvailableRepairProtocols,
    isProtocolAvailable,
    repairProtocols,
    validateRepairCatalog,
} from '../src/configurations/repair-protocols';
import { demoShip, dragonflyMK2, makeShipState } from '../src';
import { DockingMode } from '../src/ship/docking';
import { expect } from 'chai';

describe('repair protocols catalog', () => {
    it('every catalog protocol targets real @defectible fields on the dragonfly ship', () => {
        const state = makeShipState('test-ship', demoShip);
        expect(() => validateRepairCatalog(state, repairProtocols)).to.not.throw();
    });

    it('does not throw for a defectible declared on the system class but disabled on every instance this ship has (dragonfly-MK2 has only an omni radar — no radar with a skew surface)', () => {
        const state = makeShipState('test-ship', dragonflyMK2);
        expect(() => validateRepairCatalog(state, repairProtocols)).to.not.throw();
    });

    it('rejects a protocol whose target field is not a real @defectible field', () => {
        const state = makeShipState('test-ship', demoShip);
        const badCatalog: Record<string, RepairProtocolStats> = {
            bogus: {
                name: 'Bogus protocol',
                targets: [{ system: 'reactor', field: 'notARealField' }],
                duration: 10,
                energyDraw: 1,
                heat: 0,
                sideEffectSystems: [],
                tier: 'field',
            },
        };
        expect(() => validateRepairCatalog(state, badCatalog)).to.throw(/notARealField/);
    });

    it('does not throw for a target system the ship simply does not have — that is a normal configuration, not a catalog bug', () => {
        const state = makeShipState('test-ship', demoShip);
        state.chainGuns.splice(0); // simulate a ship design without a chain gun
        const catalog: Record<string, RepairProtocolStats> = {
            noChainGun: {
                name: 'Needs a chain gun',
                targets: [{ system: 'chainGuns', field: 'bearingSkew' }],
                duration: 10,
                energyDraw: 1,
                heat: 0,
                sideEffectSystems: [],
                tier: 'field',
            },
        };
        expect(() => validateRepairCatalog(state, catalog)).to.not.throw();
    });

    it('does not throw for a side-effect system the ship simply does not have', () => {
        const state = makeShipState('test-ship', demoShip);
        state.chainGuns.splice(0);
        const catalog: Record<string, RepairProtocolStats> = {
            noChainGun: {
                name: 'Side-effects a chain gun',
                targets: [{ system: 'reactor', field: 'effeciencyFactor' }],
                duration: 10,
                energyDraw: 1,
                heat: 0,
                sideEffectSystems: ['chainGuns'],
                tier: 'field',
            },
        };
        expect(() => validateRepairCatalog(state, catalog)).to.not.throw();
    });

    it('a repair protocol targets radars/bearingSkew — scan beams declare a real skew surface (#2051 review)', () => {
        const targeted = Object.values(repairProtocols).some((protocol) =>
            protocol.targets.some((target) => target.system === 'radars' && target.field === 'bearingSkew'),
        );
        expect(targeted).to.equal(true);
    });

    describe('isProtocolAvailable / getAvailableRepairProtocols', () => {
        const noChainGunTarget: RepairProtocolStats = {
            name: 'Needs a chain gun',
            targets: [{ system: 'chainGuns', field: 'bearingSkew' }],
            duration: 10,
            energyDraw: 1,
            heat: 0,
            sideEffectSystems: [],
            tier: 'field',
        };
        const noChainGunSideEffect: RepairProtocolStats = {
            name: 'Side-effects a chain gun',
            targets: [{ system: 'reactor', field: 'effeciencyFactor' }],
            duration: 10,
            energyDraw: 1,
            heat: 0,
            sideEffectSystems: ['chainGuns'],
            tier: 'field',
        };
        const needsOnlyReactor: RepairProtocolStats = {
            name: 'Reactor only',
            targets: [{ system: 'reactor', field: 'effeciencyFactor' }],
            duration: 10,
            energyDraw: 1,
            heat: 0,
            sideEffectSystems: [],
            tier: 'field',
        };

        it('is available when the ship has every referenced system', () => {
            const state = makeShipState('test-ship', demoShip);
            expect(isProtocolAvailable(state, needsOnlyReactor)).to.equal(true);
        });

        it('is unavailable when the ship lacks a targeted system', () => {
            const state = makeShipState('test-ship', demoShip);
            state.chainGuns.splice(0);
            expect(isProtocolAvailable(state, noChainGunTarget)).to.equal(false);
        });

        it('is unavailable when the ship lacks a side-effect system', () => {
            const state = makeShipState('test-ship', demoShip);
            state.chainGuns.splice(0);
            expect(isProtocolAvailable(state, noChainGunSideEffect)).to.equal(false);
        });

        it('filters an unavailable protocol out of the resolved catalog for this ship', () => {
            const state = makeShipState('test-ship', demoShip);
            state.chainGuns.splice(0);
            const catalog = { noChainGunTarget, needsOnlyReactor };
            const available = getAvailableRepairProtocols(state, catalog);
            expect(Object.keys(available)).to.deep.equal(['needsOnlyReactor']);
        });

        it('every real catalog protocol is available on the docked dragonfly (which has every system it references)', () => {
            const state = makeShipState('test-ship', demoShip);
            state.docking.mode = DockingMode.DOCKED;
            const available = getAvailableRepairProtocols(state, repairProtocols);
            expect(Object.keys(available)).to.deep.equal(Object.keys(repairProtocols));
        });

        it('a docked-tier protocol is unavailable on an undocked ship even though it has the equipment', () => {
            const state = makeShipState('test-ship', demoShip);
            expect(state.docking.mode).to.equal(DockingMode.UNDOCKED);
            expect(isProtocolAvailable(state, repairProtocols.hullWideSystemsOverhaul)).to.equal(false);
        });

        it('a docked-tier protocol becomes available once the ship is docked', () => {
            const state = makeShipState('test-ship', demoShip);
            state.docking.mode = DockingMode.DOCKED;
            expect(isProtocolAvailable(state, repairProtocols.hullWideSystemsOverhaul)).to.equal(true);
        });

        it('every field-tier protocol is equally available docked and undocked', () => {
            const state = makeShipState('test-ship', demoShip);
            const fieldProtocols = Object.values(repairProtocols).filter((p) => p.tier === 'field');
            expect(fieldProtocols.every((p) => isProtocolAvailable(state, p))).to.equal(true);

            state.docking.mode = DockingMode.DOCKED;
            expect(fieldProtocols.every((p) => isProtocolAvailable(state, p))).to.equal(true);
        });
    });
});
