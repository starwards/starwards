import $ from 'jquery';
import { client, getShipRoom } from '../client';
import { Dashboard } from '../widgets/dashboard';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetRadarWidget } from '../widgets/target-radar';
import { shipConstantsWidget } from '../widgets/ship-constants';
import { TaskLoop } from '../task-loop';
import { gunWidget } from '../widgets/gun';
import * as PIXI from 'pixi.js';
import { InputManager } from '../input-manager';
import { shipProperties } from '../ship-properties';
import { inputConfig } from '../ship-input';

// enable pixi dev-tools
// https://chrome.google.com/webstore/detail/pixijs-devtools/aamddddknhcagpehecnhphigffljadon
window.PIXI = PIXI;

const urlParams = new URLSearchParams(window.location.search);
const shipUrlParam = urlParams.get('ship');
if (shipUrlParam) {
    const layoutUrlParam = urlParams.get('layout');
    const dashboard = makeDashboard(shipUrlParam, layoutUrlParam);

    dashboard.setDragContainer($('#menuContainer'));

    // constantly scan for new ships and add widgets when current ship is found
    const loop = new TaskLoop(async () => {
        const rooms = await client.getAvailableRooms('ship');
        for (const room of rooms) {
            const shipId = room.roomId;
            if (shipUrlParam === shipId) {
                loop.stop();
                await initScreen(dashboard, shipId);
            }
        }
    }, 500);
    loop.start();
} else {
    // eslint-disable-next-line no-console
    console.error('missing "shipId" url query param');
}

async function initScreen(dashboard: Dashboard, shipId: string) {
    dashboard.registerWidget(radarWidget, { subjectId: shipId }, 'radar');
    dashboard.registerWidget(tacticalRadarWidget, { subjectId: shipId }, 'tactical radar');
    dashboard.registerWidget(pilotWidget, { shipId }, 'helm');
    dashboard.registerWidget(gunWidget, { shipId }, 'gun');
    dashboard.registerWidget(shipConstantsWidget, { shipId }, 'constants');
    dashboard.registerWidget(targetRadarWidget, { subjectId: shipId }, 'target radar');
    dashboard.setup();

    // todo extract to configurable widget
    const shipRoom = await getShipRoom(shipId);
    const properties = shipProperties(shipRoom);
    const input = new InputManager();
    input.addAxisAction(properties['smartPilot.rotation'], inputConfig['smartPilot.rotation']);
    input.addAxisAction(properties['smartPilot.strafe'], inputConfig['smartPilot.strafe']);
    input.addAxisAction(properties['smartPilot.boost'], inputConfig['smartPilot.boost']);
    input.addButtonAction(properties['smartPilot.rotationMode'], inputConfig['smartPilot.rotationMode']);
    input.addButtonAction(properties['smartPilot.maneuveringMode'], inputConfig['smartPilot.maneuveringMode']);
    input.addButtonAction(properties.useReserveSpeed, inputConfig.useReserveSpeed);
    input.addButtonAction(properties.antiDrift, inputConfig.antiDrift);
    input.addButtonAction(properties.breaks, inputConfig.breaks);
    input.addButtonAction(properties['chainGun.isFiring'], inputConfig['chainGun.isFiring']);
    input.addButtonAction(properties.target, inputConfig.target);
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
        dashboard = new Dashboard(JSON.parse(layoutStr, reviver), $('#layoutContainer'));
        dashboard.on('stateChanged', function () {
            localStorage.setItem(layoutStorageKey, JSON.stringify(dashboard.toConfig(), replacer));
        });
    } else {
        // anonymous screen
        dashboard = new Dashboard({ content: [] }, $('#layoutContainer'));
    }
    return dashboard;
}
