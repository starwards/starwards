import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, ShipDriver, Status } from '@starwards/core';
import { radarFogOfWar, toCss } from '../colors';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import { InputManager } from '../input/input-manager';
import { drawEngineeringStatus } from '../widgets/enginering-status';
import { drawFullSystemsStatus } from '../widgets/full-system-status';
import { readProp } from '../property-wrappers';
import { wrapWidgetContainer } from '../container';

ElementQueries.listen();

// enable pixi dev-tools
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ && window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

// const style = document.createElement('style');
// style.innerHTML = `
//     .tableContainer {
//         width: 350px;
//     }
//     .tableContainer .tp-lblv_v {
//         min-width: fit-content;
//     }
// `;
// document.head.appendChild(style);

const urlParams = new URLSearchParams(window.location.search);
const isEcr = (urlParams.get('station') || '').toLowerCase() === 'ecr';
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
    container.getElement().css('background-color', toCss(radarFogOfWar));
    const shipDriver = await driver.getShipDriver(shipId);
    wireInput(shipDriver);

    const topLeft = $('<div style="position: absolute; top:0; left:0;" />');
    container.getElement().append(topLeft);
    drawEngineeringStatus(wrapWidgetContainer(topLeft), shipDriver);

    const center = $('<div style="position: absolute; top:50%; left:50%; transform: translate(-50%, -50%);" />');
    container.getElement().append(center);
    drawFullSystemsStatus(wrapWidgetContainer(center), shipDriver, shipDriver.systems);
}

function wireInput(shipDriver: ShipDriver) {
    const controlledInput = new InputManager();

    const ecrControl = readProp<boolean>(shipDriver, `/ecrControl`);
    const updateControl = () => (ecrControl.getValue() === isEcr ? controlledInput.init() : controlledInput.destroy());
    ecrControl.onChange(updateControl);
    updateControl();
}
