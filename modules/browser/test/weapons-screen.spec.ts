import { Driver, ShipDriver, SpaceDriver } from '@starwards/core';

jest.mock('../src/widgets/tactical-radar', () => ({ drawTacticalRadar: jest.fn() }));
jest.mock('../src/widgets/observation-mode', () => ({ drawStationObservationMode: jest.fn() }));
jest.mock('../src/widgets/system-status', () => ({ drawSystemsStatus: jest.fn() }));
jest.mock('../src/widgets/tubes-status', () => ({ drawTubesStatus: jest.fn() }));
jest.mock('../src/widgets/ammo', () => ({ drawAmmoStatus: jest.fn() }));
jest.mock('../src/widgets/targeting', () => ({ drawTargetingStatus: jest.fn() }));
jest.mock('../src/widgets/gun', () => ({ drawGunStatus: jest.fn() }));
jest.mock('../src/input/input-manager', () => ({
    InputManager: jest.fn().mockImplementation(() => ({
        addMomentaryClickAction: jest.fn(),
        addToggleClickAction: jest.fn(),
        addRangeAction: jest.fn(),
        init: jest.fn(),
        destroy: jest.fn(),
    })),
}));
jest.mock('../src/input/hotkey-help', () => ({ setupHotkeyHelp: jest.fn(() => jest.fn()) }));
jest.mock('../src/input/tube-hotkeys', () => ({ wireTubeHotkeys: jest.fn() }));
jest.mock('../src/property-wrappers', () => ({
    readWriteAllNumberProp: jest.fn(),
    readWriteProp: jest.fn(),
    writeAllProp: jest.fn(),
    writeProp: jest.fn(),
}));

import { drawTacticalRadar } from '../src/widgets/tactical-radar';
import { initWeaponsScreen } from '../src/screens/weapons-screen';

function fakeContainer(): Parameters<typeof initWeaponsScreen>[1] {
    const container: { subContainer: () => unknown; on: () => unknown } = {
        subContainer: jest.fn(() => container),
        on: jest.fn(),
    };
    return container as unknown as Parameters<typeof initWeaponsScreen>[1];
}

function fakeDriver(shipDriver: ShipDriver, spaceDriver: SpaceDriver) {
    return {
        getShipDriver: jest.fn().mockResolvedValue(shipDriver),
        getSpaceDriver: jest.fn().mockResolvedValue(spaceDriver),
    } as unknown as Driver;
}

describe('initWeaponsScreen', () => {
    test('shows the tactical radar at a 10 km range', async () => {
        const shipDriver = { state: { chainGuns: [] }, systems: [] } as unknown as ShipDriver;
        const spaceDriver = {} as SpaceDriver;
        const driver = fakeDriver(shipDriver, spaceDriver);

        await initWeaponsScreen(driver, fakeContainer(), 'ship-1');

        expect(drawTacticalRadar).toHaveBeenCalledWith(
            spaceDriver,
            shipDriver,
            expect.anything(),
            expect.objectContaining({ range: 10000 }),
        );
    });
});
