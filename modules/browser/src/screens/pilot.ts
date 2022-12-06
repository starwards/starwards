import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, ShipDriver, Status } from '@starwards/core';
import { GamepadAxisConfig, GamepadButtonConfig, KeysRangeConfig } from '../input/input-config';
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
import { wrapWidgetContainer } from '../container';

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
        // eslint-disable-next-line no-console
        (e) => console.error(e)
    );
} else {
    // eslint-disable-next-line no-console
    console.error('missing "ship" url query param');
}

async function initScreen(driver: Driver, shipId: string) {
    const container = wrapWidgetContainer($('#wrapper'));
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();
    drawPilotRadar(spaceDriver, shipDriver, container);
    wireInput(shipDriver);
    const topRight = $('<div style="position: absolute; top:0; right:0;" />');
    container.getElement().append(topRight);
    drawSystemsStatus(
        wrapWidgetContainer(topRight),
        shipDriver,
        shipDriver.systems.filter(
            (s) =>
                s.pointer.startsWith('/thrusters/') ||
                s.pointer === '/warp' ||
                s.pointer === '/radar' ||
                s.pointer === '/smartPilot'
        )
    );
    const topLeft = $('<div style="position: absolute; top:0; left:0;" />');
    container.getElement().append(topLeft);
    drawPilotStats(wrapWidgetContainer(topLeft), shipDriver);

    const bottomLeft = $('<div style="position: absolute; bottom:0; left:0;" />');
    container.getElement().append(bottomLeft);
    drawArmorStatus(wrapWidgetContainer(bottomLeft), shipDriver, 200);

    const middleRight = $('<div style="position: absolute; top:50%; right:0;" />');
    container.getElement().append(middleRight);
    drawWarpStatus(wrapWidgetContainer(middleRight), shipDriver);

    const bottomRight = $('<div style="position: absolute; bottom:0; right:0;" />');
    container.getElement().append(bottomRight);
    drawDockingStatus(wrapWidgetContainer(bottomRight), spaceDriver, shipDriver);
}

function wireInput(shipDriver: ShipDriver) {
    const input = new InputManager();

    input.addRangeAction(readWriteNumberProp(shipDriver, '/smartPilot/rotation'), {
        axis: new GamepadAxisConfig(0, 0, [-0.1, 0.1]),
        keys: new KeysRangeConfig('e', 'q', 'e+q,q+e', 0.05),
    });
    input.addRangeAction(readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/y'), {
        axis: new GamepadAxisConfig(0, 2, [-0.1, 0.1]),
        keys: new KeysRangeConfig('d', 'a', 'a+d,d+a', 0.05),
    });
    input.addRangeAction(readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/x'), {
        axis: new GamepadAxisConfig(0, 3, [-0.1, 0.1], true),
        keys: new KeysRangeConfig('w', 's', 'w+s,s+w', 0.05),
    });
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/smartPilot/rotationTargetOffset')),
        new GamepadButtonConfig(0, 14)
    );
    input.addMomentaryClickAction(writeProp(shipDriver, '/rotationModeCommand'), new GamepadButtonConfig(0, 10));
    input.addMomentaryClickAction(writeProp(shipDriver, '/maneuveringModeCommand'), new GamepadButtonConfig(0, 11));
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/afterBurnerCommand')),
        new GamepadButtonConfig(0, 6)
    );
    input.addMomentaryClickAction(numberAction(writeProp(shipDriver, '/antiDrift')), new GamepadButtonConfig(0, 7));
    input.addMomentaryClickAction(numberAction(writeProp(shipDriver, '/breaks')), new GamepadButtonConfig(0, 5));
    input.addMomentaryClickAction(writeProp(shipDriver, '/warp/levelUpCommand'), 'r');
    input.addMomentaryClickAction(writeProp(shipDriver, '/warp/levelDownCommand'), 'f');
    input.addMomentaryClickAction(writeProp(shipDriver, '/docking/toggleCommand'), 'z');
    input.init();
}
