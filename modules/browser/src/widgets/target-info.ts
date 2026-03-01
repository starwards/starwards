import { Destructors, Faction, ShipDriver, SpaceDriver, XY } from '@starwards/core';
import { addTextBlade, createPane } from '../panel';

import { DashboardWidget } from './dashboard';
import { EmitterLoop } from '../loop';
import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
import { propertyStub } from '../property-wrappers';
import { trackTargetObject } from '../ship-logic';

function formatDistance(meters: number): string {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(0)}km`;
    }
    return `${Math.round(meters)}m`;
}

function formatBearing(degrees: number): string {
    return `${degrees.toFixed(1)}°`;
}

export function targetInfoWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver): DashboardWidget {
    class TargetInfoComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawTargetInfo(container, spaceDriver, shipDriver, trackTargetObject(spaceDriver, shipDriver));
        }
    }
    return { name: 'target info', type: 'component', component: TargetInfoComponent, defaultProps: {} };
}

export function drawTargetInfo(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    stationTarget: SelectionContainer,
) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    const pane = createPane({ title: 'Target', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());

    const typeProp = propertyStub('—');
    addTextBlade(pane, typeProp, { label: 'Type' }, cleanup.add);

    const factionProp = propertyStub('—');
    addTextBlade(pane, factionProp, { label: 'Faction' }, cleanup.add);

    const distanceProp = propertyStub('—');
    addTextBlade(pane, distanceProp, { label: 'Distance', format: (v: string) => v }, cleanup.add);

    const bearingProp = propertyStub('—');
    addTextBlade(pane, bearingProp, { label: 'Bearing', format: (v: string) => v }, cleanup.add);

    function updateTarget() {
        const target = stationTarget.getSingle();
        if (!target) {
            typeProp.setValue('—');
            factionProp.setValue('—');
            distanceProp.setValue('—');
            bearingProp.setValue('—');
            return;
        }
        typeProp.setValue(target.type);
        factionProp.setValue(Faction[target.faction] || 'Unknown');
    }

    updateTarget();
    stationTarget.events.on('changed', updateTarget);
    cleanup.add(() => stationTarget.events.off('changed', updateTarget));

    const loop = new EmitterLoop(200);
    cleanup.add(() => loop.stop());
    loop.onLoop(() => {
        const target = stationTarget.getSingle();
        if (!target) return;
        const ownShip = spaceDriver.state.getShip(shipDriver.id);
        if (!ownShip) return;
        const diff = XY.difference(target.position, ownShip.position);
        distanceProp.setValue(formatDistance(XY.lengthOf(diff)));
        bearingProp.setValue(formatBearing(XY.angleOf(diff)));
    });
    loop.start();
}
