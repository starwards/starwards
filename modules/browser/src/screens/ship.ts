import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, Status, createLogger } from '@starwards/core';
import { ScreenTeardown, runScreenLifecycle } from './station-lifecycle';

import { Config } from 'golden-layout';
import { Dashboard } from '../widgets/dashboard';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import { ammoWidget } from '../widgets/ammo';
import { armorWidget } from '../widgets/armor';
import { damageReportWidget } from '../widgets/damage-report';
import { designStateWidget } from '../widgets/design-state';
import { dockingWidget } from '../widgets/docking';
import { engineeringStatusWidget } from '../widgets/enginering-status';
import { fullSystemsStatusWidget } from '../widgets/full-system-status';
import { gunWidget } from '../widgets/gun';
import { longRangeRadarWidget } from '../widgets/long-range-radar';
import { monitorWidget } from '../widgets/monitor';
import { pilotRadarWidget } from '../widgets/pilot-radar';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { setupHotkeyHelp } from '../input/hotkey-help';
import { systemsStatusWidget } from '../widgets/system-status';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetInfoWidget } from '../widgets/target-info';
import { targetRadarWidget } from '../widgets/target-radar';
import { targetingWidget } from '../widgets/targeting';
import { tubesStatusWidget } from '../widgets/tubes-status';
import { warpWidget } from '../widgets/warp';
import { wireSinglePilotInput } from '../input/wiring';

const { error: logError } = createLogger('screen:ship');

ElementQueries.listen();
// enable pixi dev-tools
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ && window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

const driver = new Driver(window.location).connect();
const urlParams = new URLSearchParams(window.location.search);
const shipUrlParam = urlParams.get('ship');
if (shipUrlParam) {
    const statusTracker = new ClientStatus(driver, shipUrlParam);
    const layoutUrlParam = urlParams.get('layout');
    runScreenLifecycle(statusTracker, Status.SHIP_FOUND, (wrapperEl) =>
        initScreen(wrapperEl, shipUrlParam, layoutUrlParam),
    );
} else {
    logError('missing "ship" url query param');
}

async function initScreen(
    wrapperEl: JQuery<HTMLElement>,
    shipId: string,
    layoutUrlParam: string | null,
): Promise<ScreenTeardown> {
    wrapperEl.append('<ul id="menuContainer"></ul><div id="layoutContainer"></div>');
    const dashboard = makeDashboard(
        shipId,
        layoutUrlParam,
        wrapperEl.find('#layoutContainer'),
        wrapperEl.find('#menuContainer'),
    );
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();

    dashboard.registerWidget(radarWidget(spaceDriver, shipDriver), {}, 'radar');
    dashboard.registerWidget(tacticalRadarWidget(spaceDriver, shipDriver), {}, 'tactical radar');
    dashboard.registerWidget(pilotRadarWidget(spaceDriver, shipDriver), {}, 'pilot radar');
    dashboard.registerWidget(longRangeRadarWidget(spaceDriver, shipDriver), {}, 'long range radar');
    dashboard.registerWidget(pilotWidget(shipDriver), {}, 'helm');
    dashboard.registerWidget(gunWidget(shipDriver), {}, 'gun');
    dashboard.registerWidget(designStateWidget(shipDriver), { shipDriver }, 'design state');
    dashboard.registerWidget(targetRadarWidget(spaceDriver, shipDriver), {}, 'target radar');
    dashboard.registerWidget(monitorWidget(shipDriver), {}, 'monitor');
    dashboard.registerWidget(damageReportWidget(shipDriver), {}, 'damage report');
    dashboard.registerWidget(armorWidget(shipDriver), {}, 'armor');
    dashboard.registerWidget(ammoWidget(shipDriver), {}, 'ammo');
    dashboard.registerWidget(tubesStatusWidget(shipDriver), {}, 'tubes');
    dashboard.registerWidget(systemsStatusWidget(shipDriver), {}, 'systems');
    dashboard.registerWidget(fullSystemsStatusWidget(shipDriver), {}, 'systems (full)');
    dashboard.registerWidget(engineeringStatusWidget(shipDriver), {}, 'engineering status');
    dashboard.registerWidget(targetingWidget(shipDriver), {}, 'targeting');
    if (shipDriver.state.warp) {
        dashboard.registerWidget(warpWidget(shipDriver), {}, 'warp');
    }
    dashboard.registerWidget(dockingWidget(spaceDriver, shipDriver), {}, 'docking');
    dashboard.registerWidget(targetInfoWidget(spaceDriver, shipDriver, driver), {}, 'target info');
    dashboard.setup();
    const input = wireSinglePilotInput(shipDriver);
    const teardownHelp = setupHotkeyHelp(input);
    return () => {
        input.destroy();
        teardownHelp();
        dashboard.destroy();
    };
}

function makeDashboard(
    shipId: string,
    layout: string | null,
    layoutContainer: JQuery<HTMLElement>,
    menuContainer: JQuery<HTMLElement>,
): Dashboard {
    const shipIdPlaceHolder = '< ship id >';
    if (layout) {
        const reviver = (_: unknown, val: unknown) => (val === shipIdPlaceHolder ? shipId : val);
        const replacer = (_: unknown, val: unknown) => (val === shipId ? shipIdPlaceHolder : val);
        // load and auto save layout by name
        const layoutStorageKey = 'layout:' + layout;
        const layoutStr = localStorage.getItem(layoutStorageKey) || JSON.stringify({ content: [] });
        const dashboard = new Dashboard(JSON.parse(layoutStr, reviver) as Config, layoutContainer, menuContainer);
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
        return new Dashboard({ content: [] }, layoutContainer, menuContainer);
    }
}
