import $ from 'jquery';
import { radarWidget } from './radar';
import { Dashboard } from './dashboard';
import { keyboardWidget } from './keyboard';

const dashboard = new Dashboard({content : []}, $('#layoutContainer'));

dashboard.setup();
dashboard.registerWidget(radarWidget);
dashboard.registerWidget(keyboardWidget);
