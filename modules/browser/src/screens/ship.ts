import * as PIXI from 'pixi.js';

import $ from 'jquery';
import { Config } from 'golden-layout';
import { Dashboard } from '../widgets/dashboard';
import { Driver } from '../driver';
import { armorWidget } from '../widgets/armor';
import { damageReportWidget } from '../widgets/damage-report';
import { gunWidget } from '../widgets/gun';
import { monitorWidget } from '../widgets/monitor';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { shipConstantsWidget } from '../widgets/ship-constants';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetRadarWidget } from '../widgets/target-radar';
import { wireSinglePilotInput } from '../input/wiring';

// enable pixi dev-tools
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ && window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

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

    dashboard.registerWidget(radarWidget(spaceDriver, shipDriver), {}, 'radar');
    dashboard.registerWidget(tacticalRadarWidget(spaceDriver, shipDriver), {}, 'tactical radar');
    dashboard.registerWidget(pilotWidget(shipDriver), {}, 'helm');
    dashboard.registerWidget(gunWidget(shipDriver), {}, 'gun');
    dashboard.registerWidget(shipConstantsWidget(shipDriver), { shipDriver }, 'constants');
    dashboard.registerWidget(targetRadarWidget(spaceDriver, shipDriver), {}, 'target radar');
    dashboard.registerWidget(monitorWidget(shipDriver), {}, 'monitor');
    dashboard.registerWidget(damageReportWidget(shipDriver), {}, 'damage report');
    dashboard.registerWidget(armorWidget(shipDriver), {}, 'armor');
    dashboard.setup();
    wireSinglePilotInput(shipDriver);
}

function makeDashboard(shipId: string, layout: string | null): Dashboard {
    const shipIdPlaceHolder = '< ship id >';
    if (layout) {
        const reviver = (_: unknown, val: unknown) => (val === shipIdPlaceHolder ? shipId : val);
        const replacer = (_: unknown, val: unknown) => (val === shipId ? shipIdPlaceHolder : val);
        // load and auto save layout by name
        const layoutStorageKey = 'layout:' + layout;
        const layoutStr = localStorage.getItem(layoutStorageKey) || JSON.stringify({ content: [] });
        const dashboard = new Dashboard(
            JSON.parse(layoutStr, reviver) as Config,
            $('#layoutContainer'),
            $('#menuContainer')
        );
        let canSaveState = true;
        dashboard.on('stateChanged', function () {
            if (canSaveState && dashboard.isInitialised) {
                try {
                    canSaveState = false;
                    localStorage.setItem(layoutStorageKey, JSON.stringify(dashboard.toConfig(), replacer));
                } finally {
                    canSaveState = true;
                }
            }
        });
        return dashboard;
    } else {
        // anonymous screen
        return new Dashboard({ content: [] }, $('#layoutContainer'), $('#menuContainer'));
    }
}
