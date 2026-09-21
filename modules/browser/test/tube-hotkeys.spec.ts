jest.mock('@maulingmonkey/gamepad', () => ({}));

import { ClusterWarheadMode, ShipDriver } from '@starwards/core';

import { InputManager } from '../src/input/input-manager';
import { readWriteProp } from '../src/property-wrappers';
import { shipInputConfig } from '../src/input/input-config';
import { wireTubeHotkeys } from '../src/input/tube-hotkeys';

const defaultReadWriteProp = (_driver: unknown, pointer: string) => ({ pointer });

jest.mock('../src/property-wrappers', () => ({
    readWriteProp: jest.fn((_driver: unknown, pointer: string) => ({ pointer })),
    writeProp: jest.fn((_driver: unknown, pointer: string) => ({ pointer })),
}));

afterEach(() => {
    (readWriteProp as jest.Mock).mockImplementation(defaultReadWriteProp);
});

function fakeShipDriver(tubeIndexes: number[], clusterCapableIndexes: number[] = []) {
    return {
        state: {
            tubes: tubeIndexes.map((index) => ({
                index,
                design: {
                    isAmmoEnabled: (ammo: string) => ammo === 'ClusterMissile' && clusterCapableIndexes.includes(index),
                },
            })),
        },
    } as unknown as ShipDriver;
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
        wireTubeHotkeys(input, fakeShipDriver([0, 1], [0, 1]));

        const keys = input.getInputDescriptions().map((d) => d.input);
        expect(new Set(keys).size).toBe(keys.length);
    });

    test('binds a cluster-warhead hotkey for tubes that support ClusterMissile ammo, cycling through the modes', () => {
        const input = new InputManager();
        const clickSpy = jest.spyOn(input, 'addClickAction');
        let clusterWarheadValue: ClusterWarheadMode = 'Frag';
        (readWriteProp as jest.Mock).mockImplementation((_driver: unknown, pointer: string) =>
            pointer.endsWith('/clusterWarhead')
                ? {
                      pointer,
                      getValue: () => clusterWarheadValue,
                      setValue: (v: ClusterWarheadMode) => {
                          clusterWarheadValue = v;
                      },
                  }
                : { pointer },
        );

        wireTubeHotkeys(input, fakeShipDriver([0], [0]));

        expect(clickSpy).toHaveBeenCalledWith(
            expect.any(Function),
            shipInputConfig.tubeClusterWarhead[0],
            'Tube 0 Cluster Warhead',
        );
        const [onClick] = clickSpy.mock.calls.find(([, , label]) => label === 'Tube 0 Cluster Warhead')!;
        onClick();
        expect(clusterWarheadValue).toBe('ArmPen');
        onClick();
        expect(clusterWarheadValue).toBe('Frag');
    });

    test('does not bind a cluster-warhead hotkey for tubes that do not support ClusterMissile ammo', () => {
        const input = new InputManager();

        wireTubeHotkeys(input, fakeShipDriver([0]));

        const labels = input.getInputDescriptions().map((d) => d.label);
        expect(labels.some((label) => label.includes('Cluster Warhead'))).toBe(false);
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
