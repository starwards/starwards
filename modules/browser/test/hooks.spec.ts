import { ShipDriver, System } from '@starwards/core';

import { EventEmitter } from 'events';
import { brokenReadProp } from '../src/react/hooks';

function makeSystem(pointer: string, name: string): System {
    return {
        pointer,
        state: { name } as System['state'],
        defectibles: [],
        getStatus: () => 'OK',
        getHeatStatus: () => 'OK',
    };
}

function makeDriver(initialState: Record<string, unknown>) {
    const events = new EventEmitter();
    const driver = {
        state: initialState,
        events,
        sendJsonCmd: jest.fn(),
        emitChange(pointer: string) {
            events.emit(pointer);
        },
    };
    return driver as unknown as ShipDriver & { emitChange(pointer: string): void };
}

describe('brokenReadProp', () => {
    test('reports isOk true and the system name when the system is not broken', () => {
        const driver = makeDriver({ reactor: { name: 'Reactor', broken: false } });
        const system = makeSystem('/reactor', 'Reactor');

        const prop = brokenReadProp(driver)(system);

        expect(prop.getValue()).toMatchObject({ name: 'Reactor', isOk: true });
    });

    test('flips to isOk false and stamps alertTime when the system breaks', () => {
        const state = { reactor: { name: 'Reactor', broken: false } };
        const driver = makeDriver(state);
        const system = makeSystem('/reactor', 'Reactor');

        const prop = brokenReadProp(driver)(system);
        const onChange = jest.fn();
        prop.onChange(onChange);

        state.reactor.broken = true;
        driver.emitChange('/reactor/broken');

        expect(onChange).toHaveBeenCalledTimes(1);
        const value = prop.getValue();
        expect(value.isOk).toBe(false);
        expect(value.alertTime).toBeGreaterThan(0);
    });
});
