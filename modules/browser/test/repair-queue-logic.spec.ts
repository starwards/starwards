import { RepairPriority, RepairProtocolMode, RepairProtocolStats, demoShip, makeShipState } from '@starwards/core';

import { isRepairSlotVisible, repairSlotExpansion, wantsRepairSlotOpen } from '../src/widgets/repair-queue-logic';

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

describe('repair-queue folder expansion (plan card M3.11)', () => {
    it('opens only RUNNING / CANCELLING slots, or a slot carrying a notice', () => {
        expect(wantsRepairSlotOpen(RepairPriority.RUNNING, '')).toBe(true);
        expect(wantsRepairSlotOpen(RepairPriority.CANCELLING, '')).toBe(true);
        for (const p of [
            RepairPriority.OFF,
            RepairPriority.LOW,
            RepairPriority.MEDIUM,
            RepairPriority.HIGH,
            undefined,
        ]) {
            expect(wantsRepairSlotOpen(p, '')).toBe(false);
        }
        expect(wantsRepairSlotOpen(RepairPriority.OFF, 'not docked')).toBe(true);
    });
    it('first draw: collapsed unless wanted open', () => {
        expect(repairSlotExpansion(undefined, false)).toBe(false);
        expect(repairSlotExpansion(undefined, true)).toBe(true);
    });
    it('expands on becoming active, collapses on finishing', () => {
        expect(repairSlotExpansion(false, true)).toBe(true);
        expect(repairSlotExpansion(true, false)).toBe(false);
    });
    it('leaves a manual toggle alone while the rule input is unchanged', () => {
        expect(repairSlotExpansion(false, false)).toBeUndefined();
        expect(repairSlotExpansion(true, true)).toBeUndefined();
    });
});
