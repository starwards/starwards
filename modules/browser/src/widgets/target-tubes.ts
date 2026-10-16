import { addBarBlade, addTextBlade, createWidgetPane } from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';

/**
 * Read-only per-tube loadout rows for a scanned ship's tubes, drawn on Target Details. No write
 * controls — the target is not the operator's ship.
 */
export function drawTargetTubes(container: WidgetContainer, targetShipDriver: ShipDriver): () => void {
    const { pane, cleanup } = createWidgetPane(container, 'Target Tubes');
    for (const tube of targetShipDriver.state.tubes) {
        const tubeFolder = pane.addFolder({ title: tube.name, expanded: true });
        cleanup.add(() => tubeFolder.dispose());
        const loadedProjectile = readProp(targetShipDriver, `/tubes/${tube.index}/loadedProjectile`);
        addTextBlade(tubeFolder, loadedProjectile, { label: 'ammo loaded', disabled: true }, cleanup.add);
        const loading = readNumberProp(targetShipDriver, `/tubes/${tube.index}/loading`);
        addBarBlade(tubeFolder, loading, { label: 'loading' }, cleanup.add);
    }
    return () => cleanup.destroy();
}
