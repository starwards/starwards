import $ from 'jquery';
import { radarWidget } from './radar';
import { Dashboard } from './dashboard';
import { controlWidget } from './control';

const dashboard = new Dashboard({content : []}, $('#layoutContainer'));

dashboard.setup();
dashboard.registerWidget(radarWidget);
dashboard.registerWidget(controlWidget);
