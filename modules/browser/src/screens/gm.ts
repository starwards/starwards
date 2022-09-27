// import * as PIXI from 'pixi.js';

import { Dashboard, getGoldenLayoutItemConfig } from '../widgets/dashboard';

import $ from 'jquery';
import { Driver } from '@starwards/core';
import { GmWidgets } from '../widgets/gm';
import { InputManager } from '../input/input-manager';
import { armorWidget } from '../widgets/armor';
import { damageReportWidget } from '../widgets/damage-report';
import { gmInputConfig } from '../input/input-config';
import { gunWidget } from '../widgets/gun';
import { monitorWidget } from '../widgets/monitor';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { shipConstantsWidget } from '../widgets/ship-constants';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetRadarWidget } from '../widgets/target-radar';

// enable pixi dev-tools
// https://chrome.google.com/webstore/detail/pixijs-devtools/aamddddknhcagpehecnhphigffljadon
// window.PIXI = PIXI;
const driver = new Driver(window.location).connect();
const gmWidgets = new GmWidgets(driver);
const dashboard = new Dashboard(
    {
        content: [
            {
                content: [
                    { ...getGoldenLayoutItemConfig(gmWidgets.radar), width: 80 },
                    { ...getGoldenLayoutItemConfig(gmWidgets.tweak), width: 20 },
                ],
                isClosable: true,
                title: '',
                type: 'row',
            },
        ],
    },
    $('#layoutContainer'),
    $('#menuContainer')
);

dashboard.registerWidget(gmWidgets.radar);
dashboard.registerWidget(gmWidgets.tweak);

dashboard.setup();
// constantly scan for new ships and add widgets for them
void (async () => {
    const spaceDriver = await driver.getSpaceDriver();
    const spaceActions = spaceDriver.selectionActions(() => gmWidgets.selectionContainer.selectedItemsIds);

    const input = new InputManager();
    input.addStepsAction(spaceActions.rotate, gmInputConfig.rotate);
    input.addKeyAction(spaceActions.toggleFreeze, gmInputConfig.toggleFreeze);

    input.init();

    for await (const shipId of driver.getUniqueShipIds()) {
        const shipDriver = await driver.getShipDriver(shipId);
        dashboard.registerWidget(radarWidget(spaceDriver, shipDriver), {}, shipId + ' radar');
        dashboard.registerWidget(tacticalRadarWidget(spaceDriver, shipDriver), {}, shipId + ' tactical radar');
        dashboard.registerWidget(pilotWidget(shipDriver), {}, shipId + ' helm');
        dashboard.registerWidget(gunWidget(shipDriver), {}, shipId + ' gun');
        dashboard.registerWidget(shipConstantsWidget(shipDriver), { shipDriver }, shipId + ' constants');
        dashboard.registerWidget(targetRadarWidget(spaceDriver, shipDriver), {}, shipId + ' target radar');
        dashboard.registerWidget(monitorWidget(shipDriver), {}, shipId + ' monitor');
        dashboard.registerWidget(damageReportWidget(shipDriver), {}, shipId + ' damage report');
        dashboard.registerWidget(armorWidget(shipDriver), {}, shipId + ' armor');
        dashboard.setup();
    }
})();
