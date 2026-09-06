import * as PIXI from 'pixi.js';

import { Driver, createLogger } from '@starwards/core';
import { attachGameMessageOverlay, createWrapperRenderer, renderStandby } from './station-lifecycle';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import { beginStationRegistrationWithRetry } from '../station-identity';
import { stationScreens } from './station-screens';
import { wrapRootWidgetContainer } from '../container';

const { error: logError } = createLogger('screen:station');

ElementQueries.listen();

// enable pixi dev-tools
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ && window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

/**
 * The generic bridge seat (issue #2132): no `?ship=`, no fixed station type. Registers on the
 * admin room with an empty assignment and sits in standby — showing this seat's own id large, so
 * the GM can match a physical screen to its roster row — until the GM assigns it a
 * `(shipId, stationType)`. From there it renders whichever screen the stations manifest names
 * (see `station-screens.ts`), and switches screens in place on a reassignment, no reload.
 */
const driver = new Driver(window.location).connect();
const registration = beginStationRegistrationWithRetry(driver, '', '');
const renderer = createWrapperRenderer();

let shown = ''; // `${shipId}|${stationType}` of whatever is currently rendered, to skip redundant re-renders

function show() {
    void driver.getAdminDriver().then((adminDriver) => {
        const entry = adminDriver.state.stations.get(registration.stationId);
        const shipId = entry?.shipId ?? '';
        const stationType = entry?.stationType ?? '';
        const key = `${shipId}|${stationType}`;
        if (key === shown) {
            return;
        }
        shown = key;
        const screenInit = shipId && stationType ? stationScreens[stationType] : undefined;
        renderer.show((wrapperEl, addCleanup) => {
            if (screenInit) {
                const container = wrapRootWidgetContainer(wrapperEl);
                void screenInit(driver, container, shipId).then(addCleanup);
                void driver
                    .getAdminDriver()
                    .then((admin) => addCleanup(attachGameMessageOverlay(wrapperEl, admin)))
                    .catch((err: unknown) => logError('failed to attach game message overlay', err));
            } else {
                renderStandby(wrapperEl, registration.stationId);
            }
        });
    });
}

renderStandby($('#wrapper'), registration.stationId);
void driver.getAdminDriver().then((adminDriver) => {
    show();
    adminDriver.events.on('/stations', show);
    adminDriver.events.on('/stations/**', show);
});
