import $ from 'jquery';
import { gmWidget } from '../widgets/gm';
import { Dashboard } from '../widgets/dashboard';

const dashboard = new Dashboard({ content: [] }, $('#layoutContainer'));

dashboard.setup();
dashboard.setDragContainer($('#menuContainer'));
dashboard.registerWidget(gmWidget);
