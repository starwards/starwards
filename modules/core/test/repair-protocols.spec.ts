import {
    RepairProtocolStats,
    getAvailableRepairProtocols,
    isProtocolAvailable,
    repairProtocols,
    validateRepairCatalog,
} from '../src/configurations/repair-protocols';
import { dragonflySF22, makeShipState } from '../src';
import { expect } from 'chai';

describe('repair protocols catalog', () => {
    it('every catalog protocol targets real @defectible fields on the dragonfly ship', () => {
        const state = makeShipState('test-ship', dragonflySF22);
        expect(() => validateRepairCatalog(state, repairProtocols)).to.not.throw();
    });

    it('rejects a protocol whose target field is not a real @defectible field', () => {
        const state = makeShipState('test-ship', dragonflySF22);
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
        const state = makeShipState('test-ship', dragonflySF22);
        state.chainGun = null; // simulate a ship design without a chain gun
        const catalog: Record<string, RepairProtocolStats> = {
            noChainGun: {
                name: 'Needs a chain gun',
                targets: [{ system: 'chainGun', field: 'angleOffset' }],
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
        const state = makeShipState('test-ship', dragonflySF22);
        state.chainGun = null;
        const catalog: Record<string, RepairProtocolStats> = {
            noChainGun: {
                name: 'Side-effects a chain gun',
                targets: [{ system: 'reactor', field: 'effeciencyFactor' }],
                duration: 10,
                energyDraw: 1,
                heat: 0,
                sideEffectSystems: ['chainGun'],
                tier: 'field',
            },
        };
        expect(() => validateRepairCatalog(state, catalog)).to.not.throw();
    });

    describe('isProtocolAvailable / getAvailableRepairProtocols', () => {
        const noChainGunTarget: RepairProtocolStats = {
            name: 'Needs a chain gun',
            targets: [{ system: 'chainGun', field: 'angleOffset' }],
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
            sideEffectSystems: ['chainGun'],
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
            const state = makeShipState('test-ship', dragonflySF22);
            expect(isProtocolAvailable(state, needsOnlyReactor)).to.equal(true);
        });

        it('is unavailable when the ship lacks a targeted system', () => {
            const state = makeShipState('test-ship', dragonflySF22);
            state.chainGun = null;
            expect(isProtocolAvailable(state, noChainGunTarget)).to.equal(false);
        });

        it('is unavailable when the ship lacks a side-effect system', () => {
            const state = makeShipState('test-ship', dragonflySF22);
            state.chainGun = null;
            expect(isProtocolAvailable(state, noChainGunSideEffect)).to.equal(false);
        });

        it('filters an unavailable protocol out of the resolved catalog for this ship', () => {
            const state = makeShipState('test-ship', dragonflySF22);
            state.chainGun = null;
            const catalog = { noChainGunTarget, needsOnlyReactor };
            const available = getAvailableRepairProtocols(state, catalog);
            expect(Object.keys(available)).to.deep.equal(['needsOnlyReactor']);
        });

        it('every real catalog protocol is available on the dragonfly (which has every system it references)', () => {
            const state = makeShipState('test-ship', dragonflySF22);
            const available = getAvailableRepairProtocols(state, repairProtocols);
            expect(Object.keys(available)).to.deep.equal(Object.keys(repairProtocols));
        });
    });
});
