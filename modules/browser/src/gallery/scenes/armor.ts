import { dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawArmorStatus } from '../../widgets/armor';

function createShipWithArmor(id: string, healthFactors: number[]) {
    const state = makeShipState(id, dragonflySF22);
    for (let i = 0; i < state.armor.armorPlates.length && i < healthFactors.length; i++) {
        state.armor.armorPlates[i].health = state.armor.armorPlates[i].maxHealth * healthFactors[i];
    }
    return state;
}

export const armorScenes: Record<string, Scene> = {
    'armor-full-health': {
        name: 'armor-full-health',
        description: 'Armor display with all plates at 100% health (all green)',
        async setup(container: HTMLElement) {
            const healthFactors = new Array<number>(12).fill(1.0);
            const ship = createShipWithArmor('player', healthFactors);

            const mockContainer = createMockContainer(container, 400, 400);
            const mockShipDriver = createMockShipDriver(ship);

            return await drawArmorStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'armor-light-damage': {
        name: 'armor-light-damage',
        description: 'Armor display with light damage (mostly green, some yellow)',
        async setup(container: HTMLElement) {
            const healthFactors = [1.0, 0.8, 1.0, 0.9, 0.8, 1.0, 1.0, 0.85, 1.0, 0.9, 0.8, 1.0];
            const ship = createShipWithArmor('player', healthFactors);

            const mockContainer = createMockContainer(container, 400, 400);
            const mockShipDriver = createMockShipDriver(ship);

            return await drawArmorStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'armor-moderate-damage': {
        name: 'armor-moderate-damage',
        description: 'Armor display with moderate damage (mix of green, yellow, orange)',
        async setup(container: HTMLElement) {
            const healthFactors = [0.9, 0.5, 0.7, 0.4, 0.8, 0.6, 0.9, 0.3, 0.7, 0.5, 0.8, 0.6];
            const ship = createShipWithArmor('player', healthFactors);

            const mockContainer = createMockContainer(container, 400, 400);
            const mockShipDriver = createMockShipDriver(ship);

            return await drawArmorStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'armor-heavy-damage': {
        name: 'armor-heavy-damage',
        description: 'Armor display with heavy damage (mostly orange/red)',
        async setup(container: HTMLElement) {
            const healthFactors = [0.3, 0.1, 0.2, 0.15, 0.4, 0.05, 0.25, 0.1, 0.3, 0.2, 0.1, 0.35];
            const ship = createShipWithArmor('player', healthFactors);

            const mockContainer = createMockContainer(container, 400, 400);
            const mockShipDriver = createMockShipDriver(ship);

            return await drawArmorStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'armor-critical': {
        name: 'armor-critical',
        description: 'Armor display with critical damage (mostly destroyed plates)',
        async setup(container: HTMLElement) {
            const healthFactors = [0.0, 0.05, 0.0, 0.1, 0.0, 0.02, 0.0, 0.08, 0.0, 0.03, 0.0, 0.0];
            const ship = createShipWithArmor('player', healthFactors);

            const mockContainer = createMockContainer(container, 400, 400);
            const mockShipDriver = createMockShipDriver(ship);

            return await drawArmorStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'armor-sector-damage': {
        name: 'armor-sector-damage',
        description: 'Armor display with concentrated damage on one side (front damaged)',
        async setup(container: HTMLElement) {
            const healthFactors = [0.1, 0.2, 0.15, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.9, 0.3];
            const ship = createShipWithArmor('player', healthFactors);

            const mockContainer = createMockContainer(container, 400, 400);
            const mockShipDriver = createMockShipDriver(ship);

            return await drawArmorStatus(mockContainer as never, mockShipDriver as never);
        },
    },
};
