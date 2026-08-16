import { wireTubeActions } from '../src/input/wire-tube-actions';

type BindingCall = [unknown, unknown, string?];

function fakeInput() {
    return {
        addToggleClickAction: jest.fn<void, BindingCall>(),
        addMomentaryClickAction: jest.fn<void, BindingCall>(),
    };
}

function fakeShipDriver(tubeIndexes: number[]) {
    return {
        state: { tubes: tubeIndexes.map((index) => ({ index })) },
        events: { on: jest.fn(), off: jest.fn() },
        sendJsonCmd: jest.fn(),
    };
}

describe('wireTubeActions', () => {
    test('a hull with no tubes wires no tube bindings and does not throw', () => {
        const input = fakeInput();

        expect(() => wireTubeActions(input as never, fakeShipDriver([]) as never)).not.toThrow();

        expect(input.addToggleClickAction).not.toHaveBeenCalled();
        expect(input.addMomentaryClickAction).not.toHaveBeenCalled();
    });

    test('a single-tube hull binds only tube 0: safety, load/unload, and change ammo', () => {
        const input = fakeInput();

        wireTubeActions(input as never, fakeShipDriver([0]) as never);

        const toggleLabels = input.addToggleClickAction.mock.calls.map((call) => call[2] as string);
        expect(toggleLabels.sort()).toEqual(['Tube 0 Load', 'Tube 0 Safety']);
        expect(input.addMomentaryClickAction).toHaveBeenCalledTimes(1);
        expect(input.addMomentaryClickAction.mock.calls[0]?.[2]).toBe('Tube 0 Change Ammo');
    });

    test('binds every tube up to the available dedicated keys, skipping the rest without throwing', () => {
        const input = fakeInput();
        const fiveTubes = fakeShipDriver([0, 1, 2, 3, 4]); // one more tube than dedicated digit keys exist

        expect(() => wireTubeActions(input as never, fiveTubes as never)).not.toThrow();

        const toggleLabels = input.addToggleClickAction.mock.calls.map((call) => call[2] as string);
        const momentaryLabels = input.addMomentaryClickAction.mock.calls.map((call) => call[2] as string);
        expect(toggleLabels.some((label) => label.startsWith('Tube 4 '))).toBe(false);
        expect(momentaryLabels.some((label) => label.startsWith('Tube 4 '))).toBe(false);
        expect(toggleLabels.filter((label) => label.startsWith('Tube 0 '))).toHaveLength(2);
    });
});
