import $ from 'jquery';
import { radarWidget } from '../widgets/radar';
import { Dashboard } from '../widgets/dashboard';
import { keyboardWidget } from '../widgets/keyboard';

const dashboard = new Dashboard({ content: [] }, $('#layoutContainer'));

dashboard.setup();
dashboard.registerWidget(radarWidget);
dashboard.registerWidget(keyboardWidget);
