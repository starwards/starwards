import { Driver, Faction, ScanLevel, ShipDriver, SpaceDriver, Spaceship, XY, playerScanLevel } from '@starwards/core';
import { addBarBlade, addTextBlade, createWidgetPane } from '../panel';

import { propertyStub, readNumberProp, readProp } from '../property-wrappers';
import { DashboardWidget } from './dashboard';
import { EmitterLoop } from '../loop';
import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
import { drawArmorStatus } from './armor';
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

export function targetInfoWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver, driver: Driver): DashboardWidget {
    class TargetInfoComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawTargetInfo(container, driver, spaceDriver, shipDriver, trackTargetObject(spaceDriver, shipDriver));
        }
    }
    return { name: 'target info', type: 'component', component: TargetInfoComponent, defaultProps: {} };
}

/**
 * Read-only per-tube loadout rows for a scanned ship's tubes: what other stations need to
 * handle the contact as an adversary. No write controls — the target is not the operator's ship.
 */
function drawTargetTubes(container: WidgetContainer, targetShipDriver: ShipDriver): () => void {
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

export function drawTargetInfo(
    container: WidgetContainer,
    driver: Driver,
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    stationTarget: SelectionContainer,
) {
    const { pane, cleanup } = createWidgetPane(container, 'Target');

    const typeProp = propertyStub('—');
    addTextBlade(pane, typeProp, { label: 'Type' }, cleanup.add);

    const factionProp = propertyStub('—');
    addTextBlade(pane, factionProp, { label: 'Faction' }, cleanup.add);

    const distanceProp = propertyStub('—');
    addTextBlade(pane, distanceProp, { label: 'Distance', format: (v: string) => v }, cleanup.add);

    const bearingProp = propertyStub('—');
    addTextBlade(pane, bearingProp, { label: 'Bearing', format: (v: string) => v }, cleanup.add);

    // At FULL scan, a ship contact additionally renders its armor layout and tube loadout — what
    // other stations need to handle it as an adversary. These sub-widgets are recreated only when
    // the full-scan target changes, not on every 200ms tick.
    let fullScanShipId: string | undefined;
    let fullScanCleanup: (() => void) | undefined;
    const teardownFullScan = () => {
        fullScanCleanup?.();
        fullScanCleanup = undefined;
        fullScanShipId = undefined;
    };
    cleanup.add(teardownFullScan);

    function setupFullScan(shipId: string) {
        void driver.getShipDriver(shipId).then((targetShipDriver) => {
            if (fullScanShipId !== shipId) return; // target changed (or panel destroyed) while awaiting
            const armorAppPromise = drawArmorStatus(container, targetShipDriver);
            const tubesCleanup = drawTargetTubes(container, targetShipDriver);
            fullScanCleanup = () => {
                tubesCleanup();
                void armorAppPromise.then((app) => app.destroy({ removeView: true }, true));
            };
        });
    }

    const loop = new EmitterLoop(200);
    cleanup.add(() => loop.stop());
    loop.onLoop(() => {
        const target = stationTarget.getSingle();
        if (!target) {
            typeProp.setValue('—');
            factionProp.setValue('—');
            distanceProp.setValue('—');
            bearingProp.setValue('—');
            teardownFullScan();
            return;
        }
        // the panel is a player-facing selection surface: type and faction are BASIC-gated, or
        // reading out the panel would classify a contact the station has not scanned
        const scanLevel = playerScanLevel(target, shipDriver.state.faction);
        const identified = scanLevel >= ScanLevel.BASIC;
        typeProp.setValue(identified ? target.type : 'UFO');
        factionProp.setValue(identified ? Faction[target.faction] || 'Unknown' : 'Unknown');

        const isFullScanShip = scanLevel >= ScanLevel.FULL && Spaceship.isInstance(target);
        if (isFullScanShip) {
            if (target.id !== fullScanShipId) {
                teardownFullScan();
                fullScanShipId = target.id;
                setupFullScan(target.id);
            }
        } else if (fullScanShipId) {
            teardownFullScan();
        }

        const ownShip = spaceDriver.state.getShip(shipDriver.id);
        if (!ownShip) return;
        const diff = XY.difference(target.position, ownShip.position);
        distanceProp.setValue(formatDistance(XY.lengthOf(diff)));
        bearingProp.setValue(formatBearing(XY.angleOf(diff)));
    });
    loop.start();
}
