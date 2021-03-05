import * as PIXI from 'pixi.js';

import { Dashboard, getGoldenLayoutItemConfig } from '../widgets/dashboard';

import $ from 'jquery';
import { Driver } from '../driver';
import { GmWidgets } from '../widgets/gm';
import { InputManager } from '../input/input-manager';
import { gmInputConfig } from '../input/input-config';
import { gunWidget } from '../widgets/gun';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { shipConstantsWidget } from '../widgets/ship-constants';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetRadarWidget } from '../widgets/target-radar';

// enable pixi dev-tools
// https://chrome.google.com/webstore/detail/pixijs-devtools/aamddddknhcagpehecnhphigffljadon
window.PIXI = PIXI;
const driver = new Driver();
const gmWidgets = new GmWidgets(driver);
const dashboard = new Dashboard(
    { content: [getGoldenLayoutItemConfig(gmWidgets.radar)] },
    $('#layoutContainer'),
    $('#menuContainer')
);

dashboard.registerWidget(gmWidgets.radar);

dashboard.setup();
// constantly scan for new ships and add widgets for them
void (async () => {
    const spaceDriver = await driver.getSpaceDriver();
    const spaceActions = spaceDriver.selectionActions(gmWidgets.selectionContainer);

    const input = new InputManager();
    input.addStepsAction(spaceActions.rotate, gmInputConfig.rotate);
    input.addKeyAction(spaceActions.toggleLockObjects, gmInputConfig.toggleLockObjects);

    input.init();

    for await (const shipId of driver.getUniqueShipIds()) {
        const shipDriver = await driver.getShipDriver(shipId);
        dashboard.registerWidget(radarWidget(spaceDriver), { subjectId: shipId }, shipId + ' radar');
        dashboard.registerWidget(tacticalRadarWidget(spaceDriver, shipDriver), {}, shipId + ' tactical radar');
        dashboard.registerWidget(pilotWidget(shipDriver), {}, shipId + ' helm');
        dashboard.registerWidget(gunWidget(shipDriver), {}, shipId + ' gun');
        dashboard.registerWidget(shipConstantsWidget(shipDriver), { shipDriver }, shipId + ' constants');
        dashboard.registerWidget(targetRadarWidget(spaceDriver, shipDriver), {}, shipId + ' target radar');
        dashboard.setup();
    }
})();
