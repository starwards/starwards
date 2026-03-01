import { Destructors, Faction, ShipDriver, SpaceDriver, XY } from '@starwards/core';
import { addTextBlade, createPane } from '../panel';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
import { propertyStub } from '../property-wrappers';

function formatDistance(meters: number): string {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${Math.round(meters)}m`;
}

function formatBearing(degrees: number): string {
    // Normalize to 0-360
    const normalized = ((degrees % 360) + 360) % 360;
    return `${normalized.toFixed(1)}°`;
}

export function drawTargetInfo(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    stationTarget: SelectionContainer,
) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    let pane = createPane({ title: 'Target', container: container.getElement().get(0) });
    let updateInterval: ReturnType<typeof setInterval> | null = null;
    let bladeCleanup = new Destructors();

    function rebuildPane() {
        bladeCleanup.destroy();
        bladeCleanup = new Destructors();
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        pane.dispose();
        pane = createPane({ title: 'Target', container: container.getElement().get(0) });

        const target = stationTarget.getSingle();
        if (!target) {
            const noTargetProp = propertyStub('No target selected');
            addTextBlade(pane, noTargetProp, { label: 'Status' }, bladeCleanup.add);
            return;
        }

        const ownShip = spaceDriver.state.getShip(shipDriver.id);

        const typeProp = propertyStub(target.type);
        addTextBlade(pane, typeProp, { label: 'Type' }, bladeCleanup.add);

        const factionProp = propertyStub(Faction[target.faction] || 'Unknown');
        addTextBlade(pane, factionProp, { label: 'Faction' }, bladeCleanup.add);

        const distanceProp = propertyStub('—');
        addTextBlade(pane, distanceProp, { label: 'Distance', format: (v: string) => v }, bladeCleanup.add);

        const bearingProp = propertyStub('—');
        addTextBlade(pane, bearingProp, { label: 'Bearing', format: (v: string) => v }, bladeCleanup.add);

        function updateComputedFields() {
            if (!ownShip) return;
            const diff = XY.difference(target!.position, ownShip.position);
            const dist = XY.lengthOf(diff);
            const angle = XY.angleOf(diff);
            distanceProp.setValue(formatDistance(dist));
            bearingProp.setValue(formatBearing(angle));
        }

        updateComputedFields();
        updateInterval = setInterval(updateComputedFields, 200);
    }

    rebuildPane();
    cleanup.add(
        (() => {
            const handler = () => rebuildPane();
            stationTarget.events.on('changed', handler);
            return () => stationTarget.events.off('changed', handler);
        })(),
    );
    cleanup.add(() => {
        bladeCleanup.destroy();
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        pane.dispose();
    });
}
