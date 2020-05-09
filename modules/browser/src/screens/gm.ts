import $ from 'jquery';
import { gmWidget } from '../widgets/gm';
import { Dashboard } from '../widgets/dashboard';

const layoutStorageKey = 'gmLayout';
const layoutStr = localStorage.getItem(layoutStorageKey) || JSON.stringify({ content: [] });
const dashboard = new Dashboard(JSON.parse(layoutStr), $('#layoutContainer'));

dashboard.setup();
dashboard.setDragContainer($('#menuContainer'));
dashboard.registerWidget(gmWidget);

dashboard.on('stateChanged', function () {
    localStorage.setItem(layoutStorageKey, JSON.stringify(dashboard.toConfig()));
});
