import * as PIXI from 'pixi.js';

import { Dashboard, getGoldenLayoutItemConfig } from '../widgets/dashboard';

import $ from 'jquery';
import { Driver } from '../driver';
import { GmWidgets } from '../widgets/gm';
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
    for await (const shipId of driver.getUniqueShipIds()) {
        const shipDriver = await driver.getShipDriver(shipId);
        dashboard.registerWidget(radarWidget, { subjectId: shipId, spaceDriver }, shipId + ' radar');
        dashboard.registerWidget(tacticalRadarWidget, { shipDriver, spaceDriver }, shipId + ' tactical radar');
        dashboard.registerWidget(pilotWidget, { shipDriver }, shipId + ' helm');
        dashboard.registerWidget(gunWidget, { shipDriver }, shipId + ' gun');
        dashboard.registerWidget(shipConstantsWidget, { shipDriver }, shipId + ' constants');
        dashboard.registerWidget(targetRadarWidget, { shipDriver, spaceDriver }, shipId + ' target radar');
        dashboard.setup();
    }
})();
