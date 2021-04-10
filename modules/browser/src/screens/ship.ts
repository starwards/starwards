// import * as PIXI from 'pixi.js';

import $ from 'jquery';
import { Dashboard } from '../widgets/dashboard';
import { Driver } from '../driver';
import { InputManager } from '../input/input-manager';
import { alertsWidget } from '../widgets/alerts';
import { gunWidget } from '../widgets/gun';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { shipConstantsWidget } from '../widgets/ship-constants';
import { shipInputConfig } from '../input/input-config';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetRadarWidget } from '../widgets/target-radar';

// enable pixi dev-tools
// https://chrome.google.com/webstore/detail/pixijs-devtools/aamddddknhcagpehecnhphigffljadon
// window.PIXI = PIXI;
const driver = new Driver();

const urlParams = new URLSearchParams(window.location.search);
const shipUrlParam = urlParams.get('ship');
if (shipUrlParam) {
    const layoutUrlParam = urlParams.get('layout');
    const dashboard = makeDashboard(shipUrlParam, layoutUrlParam);
    void driver.waitForShip(shipUrlParam).then(
        () => initScreen(dashboard, shipUrlParam),
        // eslint-disable-next-line no-console
        (e) => console.error(e)
    );
} else {
    // eslint-disable-next-line no-console
    console.error('missing "ship" url query param');
}

async function initScreen(dashboard: Dashboard, shipId: string) {
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();

    dashboard.registerWidget(radarWidget(spaceDriver), { subjectId: shipId }, 'radar');
    dashboard.registerWidget(tacticalRadarWidget(spaceDriver, shipDriver), {}, 'tactical radar');
    dashboard.registerWidget(pilotWidget(shipDriver), {}, 'helm');
    dashboard.registerWidget(gunWidget(shipDriver), {}, 'gun');
    dashboard.registerWidget(shipConstantsWidget(shipDriver), { shipDriver }, 'constants');
    dashboard.registerWidget(targetRadarWidget(spaceDriver, shipDriver), {}, 'target radar');
    dashboard.registerWidget(alertsWidget(shipDriver), {}, 'alerts');
    dashboard.setup();
    const input = new InputManager();
    input.addRangeAction(shipDriver.shellRange, shipInputConfig.shellRange);
    input.addRangeAction(shipDriver.rotationCommand, shipInputConfig.rotationCommand);
    input.addRangeAction(shipDriver.strafeCommand, shipInputConfig.strafeCommand);
    input.addRangeAction(shipDriver.boostCommand, shipInputConfig.boostCommand);
    input.addButtonAction(shipDriver.rotationTargetOffset, shipInputConfig.resetRotatioTargetOffset);
    input.addButtonAction(shipDriver.rotationMode, shipInputConfig.rotationMode);
    input.addButtonAction(shipDriver.maneuveringMode, shipInputConfig.maneuveringMode);
    input.addButtonAction(shipDriver.afterBurner, shipInputConfig.afterBurner);
    input.addButtonAction(shipDriver.antiDrift, shipInputConfig.antiDrift);
    input.addButtonAction(shipDriver.breaks, shipInputConfig.breaks);
    input.addButtonAction(shipDriver.chainGunIsFiring, shipInputConfig.chainGunIsFiring);
    input.addButtonAction(shipDriver.target, shipInputConfig.target);
    input.addButtonAction(shipDriver.clearTarget, shipInputConfig.clearTarget);
    input.init();
}

function makeDashboard(shipId: string, layout: string | null): Dashboard {
    const shipIdPlaceHolder = '< ship id >';
    let dashboard: Dashboard;
    if (layout) {
        const reviver = (_: unknown, val: unknown) => (val === shipIdPlaceHolder ? shipId : val);
        const replacer = (_: unknown, val: unknown) => (val === shipId ? shipIdPlaceHolder : val);
        // load and auto save layout by name
        const layoutStorageKey = 'layout:' + layout;
        const layoutStr = localStorage.getItem(layoutStorageKey) || JSON.stringify({ content: [] });
        dashboard = new Dashboard(JSON.parse(layoutStr, reviver), $('#layoutContainer'), $('#menuContainer'));
        dashboard.on('stateChanged', function () {
            localStorage.setItem(layoutStorageKey, JSON.stringify(dashboard.toConfig(), replacer));
        });
    } else {
        // anonymous screen
        dashboard = new Dashboard({ content: [] }, $('#layoutContainer'), $('#menuContainer'));
    }
    return dashboard;
}
