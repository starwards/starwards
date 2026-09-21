import { RepairProtocolMode, RepairProtocolStats, demoShip, makeShipState } from '@starwards/core';

import { isRepairSlotVisible } from '../src/widgets/repair-queue-logic';

const chainGunProtocol: RepairProtocolStats = {
    name: 'Needs a chain gun',
    targets: [{ system: 'chainGuns', field: 'bearingSkew' }],
    modes: {
        [RepairProtocolMode.Responsive]: { duration: 10, energyDraw: 1, heat: 0, sideEffectSystems: [] },
        [RepairProtocolMode.Dark]: { duration: 10, energyDraw: 1, heat: 0, sideEffectSystems: [] },
    },
    tier: 'field',
};

const dockedTierProtocol: RepairProtocolStats = {
    name: 'Docked-tier, no equipment requirement',
    targets: [],
    duration: 10,
    energyDraw: 0,
    heat: 0,
    sideEffectSystems: [],
    tier: 'docked',
};

const cellProtocol: RepairProtocolStats = {
    name: 'Needs an energy cell',
    targets: [],
    modes: {
        [RepairProtocolMode.Responsive]: { duration: 10, energyDraw: 0, heat: 0, sideEffectSystems: [] },
        [RepairProtocolMode.Dark]: { duration: 10, energyDraw: 0, heat: 0, sideEffectSystems: [] },
    },
    tier: 'field',
    consumesEnergyCell: true,
};

const catalog = { chainGunProtocol, dockedTierProtocol, cellProtocol };

describe('isRepairSlotVisible (issue #2247 review: hide protocols the ship can never run)', () => {
    test('a protocol targeting equipment this ship lacks is hidden', () => {
        const state = makeShipState('s', demoShip);
        state.chainGuns.splice(0);

        expect(isRepairSlotVisible(state, 'chainGunProtocol', catalog)).toBe(false);
    });

    test('a protocol targeting equipment this ship has is visible', () => {
        const state = makeShipState('s', demoShip);
        expect(state.chainGuns.length).toBeGreaterThan(0);

        expect(isRepairSlotVisible(state, 'chainGunProtocol', catalog)).toBe(true);
    });

    test('a docked-tier protocol stays visible while undocked — tier is a runtime refusal, not a display filter', () => {
        const state = makeShipState('s', demoShip);

        expect(isRepairSlotVisible(state, 'dockedTierProtocol', catalog)).toBe(true);
    });

    test('an energy-cell protocol stays visible with zero cells — cell state is a runtime refusal, not a display filter', () => {
        const state = makeShipState('s', demoShip);
        state.reactor.energyCells = 0;

        expect(isRepairSlotVisible(state, 'cellProtocol', catalog)).toBe(true);
    });

    test('an unknown protocol id is visible (defensive: nothing to filter on)', () => {
        const state = makeShipState('s', demoShip);

        expect(isRepairSlotVisible(state, 'not-a-real-protocol', catalog)).toBe(true);
    });
});
