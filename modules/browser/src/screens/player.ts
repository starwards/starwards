import $ from 'jquery';
import { radarWidget } from '../widgets/radar';
import { Dashboard } from '../widgets/dashboard';
import { keyboardWidget } from '../widgets/keyboard';
import { pilotWidget } from '../widgets/pilot';
import { shipConstantsWidget } from '../widgets/ship-constants';

const layoutStorageKey = 'pilotLayout';
const layoutStr = localStorage.getItem(layoutStorageKey) || JSON.stringify({ content: [] });
const dashboard = new Dashboard(JSON.parse(layoutStr), $('#layoutContainer'));
dashboard.setup();
dashboard.setDragContainer($('#menuContainer'));

const urlParams = new URLSearchParams(window.location.search);
const shipId = urlParams.get('id');
if (shipId) {
    dashboard.registerWidget(radarWidget, { subjectId: shipId });
    dashboard.registerWidget(keyboardWidget, { shipId });
    dashboard.registerWidget(pilotWidget, { shipId });
    dashboard.registerWidget(shipConstantsWidget, { shipId });
} else {
    // eslint-disable-next-line no-console
    console.log('shipId is missing from URL');
}

dashboard.on('stateChanged', function () {
    localStorage.setItem(layoutStorageKey, JSON.stringify(dashboard.toConfig()));
});
