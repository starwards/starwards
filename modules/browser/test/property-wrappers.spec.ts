import { EventEmitter2 } from 'eventemitter2';
import type { RoomEventEmitter } from '@starwards/core';
import { Schema } from '@colyseus/schema';
import { readWriteAllProp } from '../src/property-wrappers';

class FakeTube {
    loadAmmo = true;
}
class FakeState extends Schema {
    tubes: FakeTube[] = [new FakeTube(), new FakeTube(), new FakeTube()];
}

function fakeDriver(state: FakeState) {
    return {
        state,
        events: new EventEmitter2() as unknown as RoomEventEmitter,
        sendJsonCmd: jest.fn(),
    };
}

describe('readWriteAllProp', () => {
    test('getValue reads the first pointer', () => {
        const state = new FakeState();
        state.tubes[0].loadAmmo = false;
        const driver = fakeDriver(state);

        const prop = readWriteAllProp<boolean>(driver, ['/tubes/0/loadAmmo', '/tubes/1/loadAmmo']);

        expect(prop.getValue()).toBe(false);
    });

    test('setValue broadcasts the same value to every tube', () => {
        const state = new FakeState();
        const driver = fakeDriver(state);
        const pointers = ['/tubes/0/loadAmmo', '/tubes/1/loadAmmo', '/tubes/2/loadAmmo'];

        const prop = readWriteAllProp<boolean>(driver, pointers);
        prop.setValue(!prop.getValue());

        expect(driver.sendJsonCmd).toHaveBeenCalledTimes(3);
        for (const pointer of pointers) {
            expect(driver.sendJsonCmd).toHaveBeenCalledWith(pointer, false);
        }
    });

    test('does not throw on an empty pointer list, and setValue is a no-op', () => {
        const state = new FakeState();
        const driver = fakeDriver(state);

        let prop!: ReturnType<typeof readWriteAllProp<boolean>>;
        expect(() => (prop = readWriteAllProp<boolean>(driver, []))).not.toThrow();
        expect(() => prop.setValue(true)).not.toThrow();
        expect(driver.sendJsonCmd).not.toHaveBeenCalled();
    });
});
