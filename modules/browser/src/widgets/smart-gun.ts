import { addAnnunciatorBlade, addTextBlade, createWidgetPane, setAnnunciatorColumns } from '../panel';

import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';
import { readProp } from '../property-wrappers';

/** Smartgun status: the toggle (hotkey `h`) and what the computer is doing with the turrets right now. */
export function drawSmartGunStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Smart Gun');
    addAnnunciatorBlade(pane, readProp(shipDriver, '/smartGunnery'), { label: 'Smart gun' }, panelCleanup.add);
    setAnnunciatorColumns(pane, 1);
    addTextBlade(
        pane,
        readProp<string>(shipDriver, '/smartGunStatus'),
        { label: 'Turrets', format: (s: string) => s.toUpperCase() },
        panelCleanup.add,
    );
}
