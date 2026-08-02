import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, ShipDriver, Status, createLogger } from '@starwards/core';
import { GamepadAxisConfig, GamepadButtonConfig, KeysRangeConfig } from '../input/input-config';
import { HPos, VPos, wrapRootWidgetContainer } from '../container';
import { InputManager, numberAction } from '../input/input-manager';
import { readWriteNumberProp, writeProp } from '../property-wrappers';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import { drawArmorStatus } from '../widgets/armor';
import { drawDockingStatus } from '../widgets/docking';
import { drawPilotRadar } from '../widgets/pilot-radar';
import { drawPilotStats } from '../widgets/pilot';
import { drawSystemsStatus } from '../widgets/system-status';
import { drawWarpStatus } from '../widgets/warp';
import { isPilotSystem } from './station-system-filters';
import { setupHotkeyHelp } from '../input/hotkey-help';

const { error: logError } = createLogger('screen:pilot');

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
    void driver.waitForShip(shipUrlParam).then(
        async () => {
            statusTracker.onStatusChange(({ status }) => {
                if (status !== Status.SHIP_FOUND) location.reload();
            });
            await initScreen(driver, shipUrlParam);
        },
        (e) => logError(e),
    );
} else {
    logError('missing "ship" url query param');
}

async function initScreen(driver: Driver, shipId: string) {
    const container = wrapRootWidgetContainer($('#wrapper'));
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();
    await drawPilotRadar(spaceDriver, shipDriver, container);
    wireInput(shipDriver);
    drawSystemsStatus(
        container.subContainer(VPos.TOP, HPos.RIGHT),
        shipDriver,
        shipDriver.systems.filter((s) => isPilotSystem(s.pointer)),
    );
    drawPilotStats(container.subContainer(VPos.TOP, HPos.LEFT), shipDriver);
    if (shipDriver.state.warp) {
        drawWarpStatus(container.subContainer(VPos.MIDDLE, HPos.RIGHT), shipDriver);
    }
    drawDockingStatus(container.subContainer(VPos.BOTTOM, HPos.RIGHT), spaceDriver, shipDriver);
    await drawArmorStatus(container.subContainer(VPos.BOTTOM, HPos.LEFT), shipDriver, 200);
}

function wireInput(shipDriver: ShipDriver) {
    const input = new InputManager();

    input.addRangeAction(
        readWriteNumberProp(shipDriver, '/smartPilot/rotation'),
        {
            axis: new GamepadAxisConfig(0, 0, [-0.1, 0.1]),
            offsetKeys: new KeysRangeConfig('e', 'q', 'e+q,q+e', 0.05),
        },
        'Rotation',
    );
    input.addRangeAction(
        readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/y'),
        {
            axis: new GamepadAxisConfig(0, 2, [-0.1, 0.1]),
            offsetKeys: new KeysRangeConfig('d', 'a', 'a+d,d+a', 0.05),
        },
        'Strafe',
    );
    input.addRangeAction(
        readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/x'),
        {
            axis: new GamepadAxisConfig(0, 3, [-0.1, 0.1], true),
            offsetKeys: new KeysRangeConfig('w', 's', 'w+s,s+w', 0.05),
        },
        'Boost',
    );
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/smartPilot/rotationTargetOffset')),
        new GamepadButtonConfig(0, 14),
        'Reset Rotation Offset',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/rotationModeCommand'),
        new GamepadButtonConfig(0, 10),
        'Rotation Mode',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/maneuveringModeCommand'),
        new GamepadButtonConfig(0, 11),
        'Maneuvering Mode',
    );
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/afterBurnerCommand')),
        new GamepadButtonConfig(0, 6),
        'After Burner',
    );
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/antiDrift')),
        new GamepadButtonConfig(0, 7),
        'Anti Drift',
    );
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/breaks')),
        new GamepadButtonConfig(0, 5),
        'Breaks',
    );
    input.addMomentaryClickAction(writeProp(shipDriver, '/warp/levelUpCommand'), 'r', 'Warp Up');
    input.addMomentaryClickAction(writeProp(shipDriver, '/warp/levelDownCommand'), 'f', 'Warp Down');
    input.addMomentaryClickAction(writeProp(shipDriver, '/docking/toggleCommand'), 'z', 'Toggle Dock');
    input.init();
    setupHotkeyHelp(input);
}
