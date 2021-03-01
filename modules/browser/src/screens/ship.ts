import * as PIXI from 'pixi.js';

import { GamepadAxisConfig, GamepadButtonConfig, GamepadButtonsRangeConfig, ShipInputConfig } from '../input-config';
import { client, getShipDriver } from '../client';

import $ from 'jquery';
import { Dashboard } from '../widgets/dashboard';
import { InputManager } from '../input-manager';
import { TaskLoop } from '../task-loop';
import { gunWidget } from '../widgets/gun';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { shipConstantsWidget } from '../widgets/ship-constants';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetRadarWidget } from '../widgets/target-radar';

// enable pixi dev-tools
// https://chrome.google.com/webstore/detail/pixijs-devtools/aamddddknhcagpehecnhphigffljadon
window.PIXI = PIXI;

const urlParams = new URLSearchParams(window.location.search);
const shipUrlParam = urlParams.get('ship');
if (shipUrlParam) {
    const layoutUrlParam = urlParams.get('layout');
    const dashboard = makeDashboard(shipUrlParam, layoutUrlParam);

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
    console.error('missing "ship" url query param');
}
export const inputConfig: ShipInputConfig = {
    // buttons
    chainGunIsFiring: new GamepadButtonConfig(0, 4),
    target: new GamepadButtonConfig(0, 2),
    useReserveSpeed: new GamepadButtonConfig(0, 6),
    antiDrift: new GamepadButtonConfig(0, 7),
    breaks: new GamepadButtonConfig(0, 5),
    rotationMode: new GamepadButtonConfig(0, 10),
    maneuveringMode: new GamepadButtonConfig(0, 11),
    // axes
    smartPilotRotation: new GamepadAxisConfig(0, 0, [-0.01, 0.01]),
    smartPilotStrafe: new GamepadAxisConfig(0, 2, [-0.01, 0.01]),
    smartPilotBoost: new GamepadAxisConfig(0, 3, [-0.01, 0.01], true),
    shellRange: new GamepadAxisConfig(0, 1, [-0.01, 0.01], true),
    // range buttons
    shellRangeButtons: new GamepadButtonsRangeConfig(
        new GamepadButtonConfig(0, 12),
        new GamepadButtonConfig(0, 13),
        new GamepadButtonConfig(0, 14),
        0.1
    ),
};

async function initScreen(dashboard: Dashboard, shipId: string) {
    const shipDriver = await getShipDriver(shipId);

    dashboard.registerWidget(radarWidget, { subjectId: shipId }, 'radar');
    dashboard.registerWidget(tacticalRadarWidget, { subjectId: shipId }, 'tactical radar');
    dashboard.registerWidget(pilotWidget, { shipId }, 'helm');
    dashboard.registerWidget(gunWidget, { shipId }, 'gun');
    dashboard.registerWidget(shipConstantsWidget, { shipDriver }, 'constants');
    dashboard.registerWidget(targetRadarWidget, { subjectId: shipId }, 'target radar');
    dashboard.setup();

    const input = new InputManager();
    input.addAxisAction(shipDriver.shellRange, inputConfig.shellRange, inputConfig.shellRangeButtons, undefined);
    input.addAxisAction(shipDriver.smartPilotRotation, inputConfig.smartPilotRotation, undefined, undefined);
    input.addAxisAction(shipDriver.smartPilotStrafe, inputConfig.smartPilotStrafe, undefined, undefined);
    input.addAxisAction(shipDriver.smartPilotBoost, inputConfig.smartPilotBoost, undefined, undefined);
    input.addButtonAction(shipDriver.rotationMode, inputConfig.rotationMode);
    input.addButtonAction(shipDriver.maneuveringMode, inputConfig.maneuveringMode);
    input.addButtonAction(shipDriver.useReserveSpeed, inputConfig.useReserveSpeed);
    input.addButtonAction(shipDriver.antiDrift, inputConfig.antiDrift);
    input.addButtonAction(shipDriver.breaks, inputConfig.breaks);
    input.addButtonAction(shipDriver.chainGunIsFiring, inputConfig.chainGunIsFiring);
    input.addButtonAction(shipDriver.target, inputConfig.target);
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
