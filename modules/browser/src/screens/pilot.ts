import * as PIXI from 'pixi.js';

import { Driver, Status } from '@starwards/core';
import { registerStationClient, runStationScreen } from './station-lifecycle';

import ElementQueries from 'css-element-queries/src/ElementQueries';
import { initPilotScreen } from './pilot-screen';

ElementQueries.listen();

// enable pixi dev-tools
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ && window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

const requestedShipId = new URLSearchParams(window.location.search).get('ship') ?? '';
const driver = new Driver(window.location).connect();
const { statusTracker, getAssignedShipId } = registerStationClient(driver, 'pilot', requestedShipId);
runStationScreen(driver, statusTracker, Status.SHIP_FOUND, async (container) =>
    initPilotScreen(driver, container, await getAssignedShipId()),
);
