jest.mock('@maulingmonkey/gamepad', () => ({}));

import { nextClusterWarheadMode, wireTubeHotkeys } from '../src/input/tube-hotkeys';
import { InputManager } from '../src/input/input-manager';
import { ShipDriver } from '@starwards/core';
import { readWriteProp } from '../src/property-wrappers';
import { shipInputConfig } from '../src/input/input-config';

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
        expect(labels).toEqual(
            expect.arrayContaining(['Tube 0 Safety', 'Tube 0 Load', 'Tube 0 Change Ammo', 'Tube 0 Cluster Mode']),
        );
        expect(labels.some((label) => label.startsWith('Tube 1'))).toBe(false);
    });

    test('binds only as many tubes as there are configured hotkey slots, without throwing', () => {
        const input = new InputManager();
        const slotCount = shipInputConfig.tubeSafety.length;

        expect(() => wireTubeHotkeys(input, fakeShipDriver([0, 1, 2, 3, 4]))).not.toThrow();

        const labels = input.getInputDescriptions().map((d) => d.label);
        expect(labels.some((label) => label.startsWith(`Tube ${slotCount}`))).toBe(false);
    });

    test('binds a per-tube cluster-mode hotkey that cycles that tube warhead mode (#2261)', () => {
        const modes: Record<string, string> = { '/tubes/0/clusterWarhead': 'Frag', '/tubes/1/clusterWarhead': 'Frag' };
        jest.mocked(readWriteProp).mockImplementation(((_driver: unknown, pointer: string) => ({
            pointer,
            getValue: () => modes[pointer],
            setValue: (v: string) => {
                modes[pointer] = v;
            },
        })) as unknown as typeof readWriteProp);
        const input = new InputManager();
        const clickSpy = jest.spyOn(input, 'addClickAction');

        wireTubeHotkeys(input, fakeShipDriver([0, 1]));

        expect(input.getInputDescriptions()).toEqual(
            expect.arrayContaining([
                {
                    input: shipInputConfig.tubeClusterWarhead[0].toUpperCase(),
                    label: 'Tube 0 Cluster Mode',
                    inputType: 'keyboard',
                },
                {
                    input: shipInputConfig.tubeClusterWarhead[1].toUpperCase(),
                    label: 'Tube 1 Cluster Mode',
                    inputType: 'keyboard',
                },
            ]),
        );
        const tube1Click = clickSpy.mock.calls.find(([, key]) => key === shipInputConfig.tubeClusterWarhead[1])![0];
        tube1Click();
        expect(modes).toEqual({ '/tubes/0/clusterWarhead': 'Frag', '/tubes/1/clusterWarhead': 'ArmPen' });
        tube1Click();
        expect(modes['/tubes/1/clusterWarhead']).toBe('Frag');
    });

    test('cluster-mode hotkeys avoid bare ctrl+digit (browser tab switch) and every other tube binding', () => {
        const all = [
            ...shipInputConfig.tubeSafety,
            ...shipInputConfig.tubeLoad,
            ...shipInputConfig.tubeChangeAmmo,
            ...shipInputConfig.tubeClusterWarhead,
            shipInputConfig.tubeIsFiring,
        ];
        expect(new Set(all).size).toBe(all.length);
        for (const key of shipInputConfig.tubeClusterWarhead) {
            expect(key).not.toMatch(/^ctrl\+\d$/);
        }
    });

    test('nextClusterWarheadMode wraps around', () => {
        expect(nextClusterWarheadMode('Frag')).toBe('ArmPen');
        expect(nextClusterWarheadMode('ArmPen')).toBe('Frag');
    });
});
