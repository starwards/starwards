import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, ShipDriver, Status } from '@starwards/core';
import { readWriteProp, writeProp } from '../property-wrappers';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import { InputManager } from '../input/input-manager';
import { drawAmmoStatus } from '../widgets/ammo';
import { drawSystemsStatus } from '../widgets/system-status';
import { drawTacticalRadar } from '../widgets/tactical-radar';
import { drawTargetingStatus } from '../widgets/targeting';
import { drawTubesStatus } from '../widgets/tubes-status';
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
    drawTacticalRadar(spaceDriver, shipDriver, container, { range: 5000 });
    wireInput(shipDriver);
    const topRight = $('<div style="position: absolute; top:0; right:0;" />');
    container.getElement().append(topRight);
    drawSystemsStatus(
        wrapWidgetContainer(topRight),
        shipDriver,
        shipDriver.systems.filter(
            (s) => s.pointer.startsWith('/tubes/') || s.pointer === '/chainGun' || s.pointer === '/magazine'
        )
    );
    const topLeft = $('<div style="position: absolute; top:0; left:0;" />');
    container.getElement().append(topLeft);
    drawTubesStatus(wrapWidgetContainer(topLeft), shipDriver);

    const middleLeft = $('<div style="position: absolute; top:50%; left:0;" />');
    container.getElement().append(middleLeft);
    drawAmmoStatus(wrapWidgetContainer(middleLeft), shipDriver);

    const middleRight = $('<div style="position: absolute; top:50%; right:0;" />');
    container.getElement().append(middleRight);
    drawTargetingStatus(wrapWidgetContainer(middleRight), shipDriver);
}

function wireInput(shipDriver: ShipDriver) {
    const input = new InputManager();
    input.addMomentaryClickAction(writeProp(shipDriver, '/weaponsTarget/nextTargetCommand'), ']');
    input.addMomentaryClickAction(writeProp(shipDriver, '/weaponsTarget/prevTargetCommand'), '[');
    input.addMomentaryClickAction(writeProp(shipDriver, '/weaponsTarget/clearTargetCommand'), "'");
    input.addToggleClickAction(readWriteProp(shipDriver, '/weaponsTarget/shipOnly'), 'p');
    input.addToggleClickAction(readWriteProp(shipDriver, '/weaponsTarget/enemyOnly'), 'o');
    input.addToggleClickAction(readWriteProp(shipDriver, '/weaponsTarget/shortRangeOnly'), 'i');

    input.addMomentaryClickAction(writeProp(shipDriver, '/tubes/0/isFiring'), 'x');
    input.addToggleClickAction(readWriteProp(shipDriver, '/tubes/0/loadAmmo'), 'c');
    input.addMomentaryClickAction(writeProp(shipDriver, '/tubes/0/changeProjectileCommand'), 'v');
    input.init();
}
