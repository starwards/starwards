jest.mock('@maulingmonkey/gamepad', () => ({}));

import { InputManager } from '../src/input/input-manager';
import { ShipDriver } from '@starwards/core';
import { shipInputConfig } from '../src/input/input-config';
import { wireTubeHotkeys } from '../src/input/tube-hotkeys';

jest.mock('../src/property-wrappers', () => ({
    readWriteProp: jest.fn((_driver: unknown, pointer: string) => ({ pointer })),
    writeProp: jest.fn((_driver: unknown, pointer: string) => ({ pointer })),
}));

function fakeShipDriver(tubeIndexes: number[]) {
    return { state: { tubes: tubeIndexes.map((index) => ({ index })) } } as unknown as ShipDriver;
}

describe('wireTubeHotkeys', () => {
    test('binds a dedicated safety, load, and change-ammo hotkey per tube', () => {
        const input = new InputManager();
        const toggleSpy = jest.spyOn(input, 'addToggleClickAction');
        const momentarySpy = jest.spyOn(input, 'addMomentaryClickAction');

        wireTubeHotkeys(input, fakeShipDriver([0, 1]));

        expect(toggleSpy).toHaveBeenCalledWith(
            { pointer: '/tubes/0/safetyLocked' },
            shipInputConfig.tubeSafety[0],
            'Tube 0 Safety',
        );
        expect(toggleSpy).toHaveBeenCalledWith(
            { pointer: '/tubes/0/loadAmmo' },
            shipInputConfig.tubeLoad[0],
            'Tube 0 Load',
        );
        expect(momentarySpy).toHaveBeenCalledWith(
            { pointer: '/tubes/0/changeProjectileCommand' },
            shipInputConfig.tubeChangeAmmo[0],
            'Tube 0 Change Ammo',
        );
        expect(toggleSpy).toHaveBeenCalledWith(
            { pointer: '/tubes/1/safetyLocked' },
            shipInputConfig.tubeSafety[1],
            'Tube 1 Safety',
        );
        expect(toggleSpy).toHaveBeenCalledWith(
            { pointer: '/tubes/1/loadAmmo' },
            shipInputConfig.tubeLoad[1],
            'Tube 1 Load',
        );
        expect(momentarySpy).toHaveBeenCalledWith(
            { pointer: '/tubes/1/changeProjectileCommand' },
            shipInputConfig.tubeChangeAmmo[1],
            'Tube 1 Change Ammo',
        );
    });

    test('a tube key set is unique per tube — no two tubes share a binding', () => {
        const input = new InputManager();
        wireTubeHotkeys(input, fakeShipDriver([0, 1]));

        const keys = input.getInputDescriptions().map((d) => d.input);
        expect(new Set(keys).size).toBe(keys.length);
    });

    test('a hull with no tubes wires no tube bindings and does not throw', () => {
        const input = new InputManager();

        expect(() => wireTubeHotkeys(input, fakeShipDriver([]))).not.toThrow();
        expect(input.getInputDescriptions()).toHaveLength(0);
    });

    test('a single-tube hull binds only tube 0', () => {
        const input = new InputManager();

        wireTubeHotkeys(input, fakeShipDriver([0]));

        const labels = input.getInputDescriptions().map((d) => d.label);
        expect(labels).toEqual(expect.arrayContaining(['Tube 0 Safety', 'Tube 0 Load', 'Tube 0 Change Ammo']));
        expect(labels.some((label) => label.startsWith('Tube 1'))).toBe(false);
    });

    test('binds only as many tubes as there are configured hotkey slots, without throwing', () => {
        const input = new InputManager();
        const slotCount = shipInputConfig.tubeSafety.length;

        expect(() => wireTubeHotkeys(input, fakeShipDriver([0, 1, 2, 3, 4]))).not.toThrow();

        const labels = input.getInputDescriptions().map((d) => d.label);
        expect(labels.some((label) => label.startsWith(`Tube ${slotCount}`))).toBe(false);
    });
});
