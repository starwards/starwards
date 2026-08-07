import { DockingMode, ShipDriver, SpaceDriver, getClosestDockingTarget, getSpatialIndex } from '@starwards/core';
import { addListBlade, addTextBlade, createWidgetPane } from '../panel';
import { propertyStub, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { EmitterLoop } from '../loop';
import { WidgetContainer } from '../container';

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
    const { pane, cleanup } = createWidgetPane(container, 'Docking');
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
