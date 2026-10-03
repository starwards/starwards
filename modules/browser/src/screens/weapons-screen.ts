import { Driver, ShipDriver, radarReach } from '@starwards/core';
import { ScreenContainer, ScreenTeardown, setDisplayOnly } from './station-lifecycle';
import { readWriteAllNumberProp, readWriteProp, writeAllProp, writeProp } from '../property-wrappers';

import { InputManager } from '../input/input-manager';
import { drawAmmoStatus } from '../widgets/ammo';
import { drawGunStatus } from '../widgets/gun';
import { drawRadarHeader } from '../widgets/radar-header';
import { drawSystemsStatus } from '../widgets/system-status';
import { drawTacticalRadar } from '../widgets/tactical-radar';
import { drawTargetingStatus } from '../widgets/targeting';
import { drawTubesStatus } from '../widgets/tubes-status';
import { isWeaponsSystem } from './station-system-filters';
import { setupHotkeyHelp } from '../input/hotkey-help';
import { shipInputConfig } from '../input/input-config';
import { stationGrid } from '../container';
import { wireTubeHotkeys } from '../input/tube-hotkeys';

const radarRange = radarReach.tactical;

export async function initWeaponsScreen(
    driver: Driver,
    container: ScreenContainer,
    shipId: string,
): Promise<ScreenTeardown> {
    setDisplayOnly(true, 'weapons');
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();
    await drawTacticalRadar(spaceDriver, shipDriver, container, { range: radarRange });
    const grid = stationGrid(container, { left: 272, right: 256 });
    drawRadarHeader(grid.center({ fill: true }), `TACTICAL · ${radarRange / 1000} KM`, `SHIP ${shipId}`);
    const teardownInput = wireInput(shipDriver);
    drawTubesStatus(grid.left(), shipDriver);
    drawAmmoStatus(grid.left({ scroll: true }), shipDriver);
    drawTargetingStatus(grid.right(), shipDriver);
    drawGunStatus(grid.right(), shipDriver);
    drawSystemsStatus(
        grid.right({ scroll: true }),
        shipDriver,
        shipDriver.systems.filter((s) => isWeaponsSystem(s.pointer)),
        true,
    );
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
