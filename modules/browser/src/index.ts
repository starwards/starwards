import $ from 'jquery';
import { radarWidget } from './radar';
import { Dashboard } from './dashboard';

const dashboard = new Dashboard({content : []}, $('#layoutContainer'));

dashboard.setup();
dashboard.registerWidget(radarWidget);
