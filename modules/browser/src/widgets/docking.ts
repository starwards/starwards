import { Destructors, DockingMode, ShipDriver, SpaceDriver, getClosestDockingTarget } from '@starwards/core';
import { addListBlade, addTextBlade, createPane } from '../panel';
import { propertyStub, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { EmitterLoop } from '../loop';
import { WidgetContainer } from '../container';
import { getSpatialIndex } from '../radar/spatial-index';

export function dockingWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver): DashboardWidget {
    class DockingComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawDockingStatus(container, spaceDriver, shipDriver);
        }
    }
    return {
        name: 'docking',
        type: 'component',
        component: DockingComponent,
        defaultProps: {},
    };
}
export function drawDockingStatus(container: WidgetContainer, spaceDriver: SpaceDriver, shipDriver: ShipDriver) {
    const cleanup = new Destructors();
    const pane = createPane({ title: 'Docking', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());
    container.on('destroy', cleanup.destroy);
    addTextBlade(pane, readProp(shipDriver, '/docking/targetId'), { label: 'Current Target' }, cleanup.add);
    const options = Object.values(DockingMode)
        .filter<number>((k): k is number => typeof k === 'number')
        .map((value) => ({ value, text: String(DockingMode[value]) }));
    addListBlade(pane, readProp(shipDriver, '/docking/mode'), { label: 'Mode', options }, cleanup.add);

    const loop = new EmitterLoop(250);
    const spatial = getSpatialIndex(spaceDriver);
    cleanup.add(() => loop.stop());
    const potentialTargetProp = propertyStub<string>('');
    loop.onLoop(() => potentialTargetProp.setValue(getClosestDockingTarget(shipDriver.state, spatial) || ''));
    loop.start();
    addTextBlade(pane, potentialTargetProp, { label: 'Closest Option' }, cleanup.add);
}
