import { Driver, ShipDriver } from '@starwards/core';
import { HPos, VPos } from '../container';
import { ScreenContainer, ScreenTeardown } from './station-lifecycle';
import { readWriteAllNumberProp, readWriteProp, writeAllProp, writeProp } from '../property-wrappers';

import { InputManager } from '../input/input-manager';
import { drawAmmoStatus } from '../widgets/ammo';
import { drawGunStatus } from '../widgets/gun';
import { drawStationObservationMode } from '../widgets/observation-mode';
import { drawSystemsStatus } from '../widgets/system-status';
import { drawTacticalRadar } from '../widgets/tactical-radar';
import { drawTargetingStatus } from '../widgets/targeting';
import { drawTubesStatus } from '../widgets/tubes-status';
import { isWeaponsSystem } from './station-system-filters';
import { setupHotkeyHelp } from '../input/hotkey-help';
import { shipInputConfig } from '../input/input-config';
import { wireTubeHotkeys } from '../input/tube-hotkeys';

export async function initWeaponsScreen(
    driver: Driver,
    container: ScreenContainer,
    shipId: string,
): Promise<ScreenTeardown> {
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();
    await drawTacticalRadar(spaceDriver, shipDriver, container, { range: 5000 });
    await drawStationObservationMode(container.subContainer(VPos.TOP, HPos.MIDDLE), driver);
    const teardownInput = wireInput(shipDriver);
    drawSystemsStatus(
        container.subContainer(VPos.TOP, HPos.RIGHT),
        shipDriver,
        shipDriver.systems.filter((s) => isWeaponsSystem(s.pointer)),
    );
    drawTubesStatus(container.subContainer(VPos.TOP, HPos.LEFT), shipDriver);
    drawAmmoStatus(container.subContainer(VPos.MIDDLE, HPos.LEFT), shipDriver);
    drawTargetingStatus(container.subContainer(VPos.MIDDLE, HPos.RIGHT), shipDriver);
    drawGunStatus(container.subContainer(VPos.BOTTOM, HPos.LEFT), shipDriver);
    return teardownInput;
}

function wireInput(shipDriver: ShipDriver): ScreenTeardown {
    const input = new InputManager();
    input.addMomentaryClickAction(writeProp(shipDriver, '/weaponsTarget/nextTargetCommand'), ']', 'Next Target');
    input.addMomentaryClickAction(writeProp(shipDriver, '/weaponsTarget/prevTargetCommand'), '[', 'Prev Target');
    input.addMomentaryClickAction(writeProp(shipDriver, '/weaponsTarget/clearTargetCommand'), "'", 'Clear Target');
    input.addToggleClickAction(readWriteProp(shipDriver, '/weaponsTarget/shipOnly'), 'p', 'Ships Only');
    input.addToggleClickAction(readWriteProp(shipDriver, '/weaponsTarget/enemyOnly'), 'o', 'Enemy Only');
    input.addToggleClickAction(readWriteProp(shipDriver, '/weaponsTarget/shortRangeOnly'), 'i', 'Short Range Only');

    input.addMomentaryClickAction(writeProp(shipDriver, '/fireTubesCommand'), 'x', 'Fire Tubes');
    wireTubeHotkeys(input, shipDriver);

    input.addMomentaryClickAction(
        writeAllProp(
            shipDriver,
            shipDriver.state.chainGuns.map((_, index) => `/chainGuns/${index}/isFiring`),
        ),
        'f',
        'Fire Chain Gun',
    );
    input.addToggleClickAction(readWriteProp(shipDriver, '/chainGuns/0/loadAmmo'), 'g', 'Load Chain Gun');
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/chainGuns/0/changeProjectileCommand'),
        'b',
        'Change Gun Ammo',
    );
    input.addRangeAction(
        readWriteAllNumberProp(
            shipDriver,
            shipDriver.state.chainGuns.map((_, index) => `/chainGuns/${index}/shellRange`),
        ),
        shipInputConfig.shellRange,
        'Shell Range',
    );
    input.init();
    const teardownHelp = setupHotkeyHelp(input);
    return () => {
        input.destroy();
        teardownHelp();
    };
}
