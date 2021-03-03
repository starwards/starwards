import * as PIXI from 'pixi.js';

import { Dashboard, getGoldenLayoutItemConfig } from '../widgets/dashboard';
import { client, getShipDriver } from '../driver';

import $ from 'jquery';
import { GmWidgets } from '../widgets/gm';
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
const gmWidgets = new GmWidgets();
const dashboard = new Dashboard(
    { content: [getGoldenLayoutItemConfig(gmWidgets.radar)] },
    $('#layoutContainer'),
    $('#menuContainer')
);

dashboard.registerWidget(gmWidgets.radar);

dashboard.setup();
// constantly scan for new ships and add widgets for them
const ships = new Set<string>();
const loop = new TaskLoop(async () => {
    const rooms = await client.getAvailableRooms('ship');
    for (const room of rooms) {
        const shipId = room.roomId;
        if (!ships.has(shipId)) {
            ships.add(shipId);
            const shipDriver = await getShipDriver(shipId);
            dashboard.registerWidget(radarWidget, { subjectId: shipId }, shipId + ' radar');
            dashboard.registerWidget(tacticalRadarWidget, { subjectId: shipId }, shipId + ' tactical radar');
            dashboard.registerWidget(pilotWidget, { shipId }, shipId + ' helm');
            dashboard.registerWidget(gunWidget, { shipId }, shipId + ' gun');
            dashboard.registerWidget(shipConstantsWidget, { shipDriver }, shipId + ' constants');
            dashboard.registerWidget(targetRadarWidget, { subjectId: shipId }, shipId + ' target radar');
            dashboard.setup();
        }
    }
}, 500);
loop.start();
