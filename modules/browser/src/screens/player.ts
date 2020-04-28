import $ from 'jquery';
import { radarWidget } from '../widgets/radar';
import { Dashboard } from '../widgets/dashboard';
import { keyboardWidget } from '../widgets/keyboard';
import { pilotWidget } from '../widgets/pilot';

const dashboard = new Dashboard({ content: [] }, $('#layoutContainer'));
dashboard.setup();

const urlParams = new URLSearchParams(window.location.search);
const shipId = urlParams.get('id');
if (shipId) {
    dashboard.registerWidget(radarWidget, { subjectId: shipId });
    dashboard.registerWidget(keyboardWidget, { shipId });
    dashboard.registerWidget(pilotWidget, { shipId });
} else {
    // tslint:disable-next-line: no-console
    console.log('shipId is missing from URL');
}
