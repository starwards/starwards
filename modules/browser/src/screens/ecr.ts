import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, ShipDriver, Status } from '@starwards/core';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import { InputManager } from '../input/input-manager';
import { drawSystemsStatus } from '../widgets/system-status';
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
    wireInput(shipDriver);
    const topRight = $('<div style="position: absolute; top:0; right:0;" />');
    container.getElement().append(topRight);
    drawSystemsStatus(wrapWidgetContainer(topRight), shipDriver, shipDriver.systems);
}

function wireInput(_shipDriver: ShipDriver) {
    const input = new InputManager();

    input.init();
}
