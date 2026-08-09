import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, ShipDriver, Status, createLogger } from '@starwards/core';
import { HPos, VPos } from '../container';
import { ScreenContainer, ScreenTeardown, runStationScreen } from './station-lifecycle';
import { readWriteProp, writeAllProp, writeProp } from '../property-wrappers';

import ElementQueries from 'css-element-queries/src/ElementQueries';
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

const { error: logError } = createLogger('screen:weapons');

ElementQueries.listen();

// enable pixi dev-tools
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ && window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

const urlParams = new URLSearchParams(window.location.search);
const shipUrlParam = urlParams.get('ship');
if (shipUrlParam) {
    const driver = new Driver(window.location).connect();
    const statusTracker = new ClientStatus(driver, shipUrlParam);
    runStationScreen(statusTracker, Status.SHIP_FOUND, (container) => initScreen(driver, shipUrlParam, container));
} else {
    logError('missing "ship" url query param');
}

async function initScreen(driver: Driver, shipId: string, container: ScreenContainer): Promise<ScreenTeardown> {
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
    input.addToggleClickAction(readWriteProp(shipDriver, '/tubes/0/loadAmmo'), 'c', 'Load Tube');
    input.addMomentaryClickAction(
        writeAllProp(
            shipDriver,
            shipDriver.state.tubes.map((tube) => `/tubes/${tube.index}/changeProjectileCommand`),
        ),
        'v',
        'Change Tube Ammo',
    );
    for (const tube of shipDriver.state.tubes) {
        input.addToggleClickAction(
            readWriteProp(shipDriver, `/tubes/${tube.index}/safetyLocked`),
            shipInputConfig.tubeSafety[tube.index],
            `Tube ${tube.index} Safety`,
        );
    }

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
    input.init();
    const teardownHelp = setupHotkeyHelp(input);
    return () => {
        input.destroy();
        teardownHelp();
    };
}
