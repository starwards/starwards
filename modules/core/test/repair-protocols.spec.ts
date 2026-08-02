import { RepairProtocolStats, repairProtocols, validateRepairCatalog } from '../src/configurations/repair-protocols';
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

    it('rejects a protocol whose target system does not exist on the ship', () => {
        const state = makeShipState('test-ship', dragonflySF22);
        state.chainGun = null; // simulate a ship design without a chain gun
        const badCatalog: Record<string, RepairProtocolStats> = {
            bogus: {
                name: 'Bogus protocol',
                targets: [{ system: 'chainGun', field: 'angleOffset' }],
                duration: 10,
                energyDraw: 1,
                heat: 0,
                sideEffectSystems: [],
                tier: 'field',
            },
        };
        expect(() => validateRepairCatalog(state, badCatalog)).to.throw(/chainGun/);
    });

    it('rejects a protocol whose side-effect system does not exist on the ship', () => {
        const state = makeShipState('test-ship', dragonflySF22);
        state.chainGun = null; // simulate a ship design without a chain gun
        const badCatalog: Record<string, RepairProtocolStats> = {
            bogus: {
                name: 'Bogus protocol',
                targets: [{ system: 'reactor', field: 'effeciencyFactor' }],
                duration: 10,
                energyDraw: 1,
                heat: 0,
                sideEffectSystems: ['chainGun'],
                tier: 'field',
            },
        };
        expect(() => validateRepairCatalog(state, badCatalog)).to.throw(/chainGun/);
    });
});
