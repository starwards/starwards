import $ from 'jquery';
import { client } from '../client';
import { Dashboard } from '../widgets/dashboard';
import { gmWidget } from '../widgets/gm';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { shipConstantsWidget } from '../widgets/ship-constants';
import { TaskLoop } from '../task-loop';
import { gunWidget } from '../widgets/gun';

const urlParams = new URLSearchParams(window.location.search);
const layoutUrlParam = urlParams.get('layout');
let dashboard: Dashboard;
if (layoutUrlParam) {
    // load and auto save layout by name
    const layoutStorageKey = 'layout:' + layoutUrlParam;
    const layoutStr = localStorage.getItem(layoutStorageKey) || JSON.stringify({ content: [] });
    dashboard = new Dashboard(JSON.parse(layoutStr), $('#layoutContainer'));
    dashboard.on('stateChanged', function () {
        localStorage.setItem(layoutStorageKey, JSON.stringify(dashboard.toConfig()));
    });
} else {
    // anonymous screen
    dashboard = new Dashboard({ content: [] }, $('#layoutContainer'));
}

dashboard.setDragContainer($('#menuContainer'));
dashboard.registerWidget(gmWidget);

dashboard.setup();
// constantly scan for new ships and add widgets for them
const ships = new Set<string>();
const loop = new TaskLoop(async () => {
    const rooms = await client.getAvailableRooms('ship');
    for (const room of rooms) {
        const shipId = room.roomId;
        if (!ships.has(shipId)) {
            ships.add(shipId);
            dashboard.registerWidget(radarWidget, { subjectId: shipId }, shipId + ' radar');
            dashboard.registerWidget(pilotWidget, { shipId }, shipId + ' helm');
            dashboard.registerWidget(gunWidget, { shipId }, shipId + ' gun');
            dashboard.registerWidget(shipConstantsWidget, { shipId }, shipId + ' constants');
            dashboard.setup();
        }
    }
}, 500);
loop.start();
