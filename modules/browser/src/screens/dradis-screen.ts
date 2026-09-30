import { Driver, Waypoint, XY } from '@starwards/core';
import { FollowController, drawDradisRadar } from '../widgets/dradis-radar';
import { ScreenContainer, ScreenTeardown, setDisplayOnly } from './station-lifecycle';

import { CameraView } from '../radar/camera-view';
import EventEmitter from 'eventemitter3';
import { InputManager } from '../input/input-manager';
import { RadarLayersPanel } from '../widgets/radar-layers';
import { SelectionContainer } from '../radar/selection-container';
import { WaypointGroupLayers } from '../radar/waypoint-group-layers';
import { WaypointPlacementLayer } from '../radar/waypoint-placement-layer';
import { WaypointSelectionLayer } from '../radar/waypoint-selection-layer';

import { drawMapCaption } from '../widgets/map-caption';
import { drawPlacementSettings } from '../widgets/waypoint-placement-settings';
import { drawStationObservationMode } from '../widgets/observation-mode';
import { drawWaypointEdit } from '../widgets/waypoint-edit';
import { drawWaypointGroups } from '../widgets/waypoint-groups';
import { setupHotkeyHelp } from '../input/hotkey-help';
import { stationGrid } from '../container';

type ZoomEvent = 'zoomIn' | 'zoomOut';

export async function initDradisScreen(
    driver: Driver,
    container: ScreenContainer,
    shipId: string,
): Promise<ScreenTeardown> {
    setDisplayOnly(false, 'dradis');
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();

    const zoomEvents = new EventEmitter<ZoomEvent>();

    const {
        root: radarView,
        layers,
        follow,
        cellSize,
    } = await drawDradisRadar(spaceDriver, shipDriver, container, zoomEvents);
    container.getElement().on('contextmenu', (e) => e.preventDefault());

    const grid = stationGrid(container, { left: 240, right: 240 });
    await drawStationObservationMode(grid.center(), driver);
    const placementSlot = grid.left();
    const editSlot = grid.left({ scroll: true });
    const layersSlot = grid.right({ scroll: true });
    const groupsSlot = grid.right({ bottom: true });
    drawMapCaption(grid.left({ bottom: true }), radarView, cellSize, shipId);

    const waypointSelection = new SelectionContainer().init(spaceDriver);
    const layersPanel = new RadarLayersPanel(layersSlot);
    for (const [name, layer] of Object.entries(layers)) {
        layersPanel.addLayer(name, layer);
    }
    const waypointLayer = new WaypointPlacementLayer(radarView, spaceDriver, shipId);
    const placementSettings = drawPlacementSettings(placementSlot, spaceDriver, shipId, () => waypointLayer.toggle());
    waypointLayer.getSettings = placementSettings.getSettings;
    const focus = (position: XY) => {
        follow.setFollow(false);
        radarView.camera.set(position);
    };
    const groupsPanel = drawWaypointGroups(groupsSlot, spaceDriver, shipId, waypointSelection, focus);
    new WaypointGroupLayers(
        radarView,
        spaceDriver,
        shipId,
        waypointSelection,
        (name, layer, collection) => {
            groupsPanel.addGroup(collection);
            layersPanel.addLayer(name, layer.renderRoot, (visible) => {
                if (!visible) {
                    // hiding a group layer drops its waypoints from the selection
                    const hidden = [...waypointSelection.selectedItems].filter(
                        (o) => Waypoint.isInstance(o) && o.collection === collection,
                    );
                    waypointSelection.remove(hidden);
                }
            });
        },
        (name, collection) => {
            groupsPanel.removeGroup(collection);
            layersPanel.removeLayer(name);
        },
    );

    const selectionLayer = new WaypointSelectionLayer(
        radarView,
        spaceDriver,
        waypointSelection,
        shipId,
        undefined,
        () => follow.setFollow(false),
    );
    radarView.addLayer(selectionLayer.renderRoot);
    radarView.addLayer(waypointLayer.renderRoot);

    drawWaypointEdit(editSlot, spaceDriver, shipId, waypointSelection, focus);
    return wireInput(radarView, follow, zoomEvents, waypointLayer);
}

const PAN_SCREEN_FRACTION = 0.1;

function wireInput(
    radarView: CameraView,
    follow: FollowController,
    zoomEvents: EventEmitter<ZoomEvent>,
    waypointLayer: WaypointPlacementLayer,
): ScreenTeardown {
    function pan(direction: XY) {
        follow.setFollow(false);
        const step = Math.min(radarView.renderer.width, radarView.renderer.height) * PAN_SCREEN_FRACTION;
        radarView.camera.set(XY.add(radarView.camera, XY.scale(direction, step / radarView.camera.zoom)));
    }

    const input = new InputManager();
    input.addClickAction(() => pan({ x: 0, y: -1 }), 'up', 'Pan Up');
    input.addClickAction(() => pan({ x: 0, y: 1 }), 'down', 'Pan Down');
    input.addClickAction(() => pan({ x: -1, y: 0 }), 'left', 'Pan Left');
    input.addClickAction(() => pan({ x: 1, y: 0 }), 'right', 'Pan Right');
    input.addClickAction(() => zoomEvents.emit('zoomIn'), '=', 'Zoom In');
    input.addClickAction(() => zoomEvents.emit('zoomOut'), '-', 'Zoom Out');
    input.addClickAction(() => waypointLayer.toggle(), 'w', 'Place Waypoint');
    input.addClickAction(() => follow.setFollow(!follow.isFollowing()), 'f', 'Follow Ship');
    input.init();
    const teardownHelp = setupHotkeyHelp(input);
    return () => {
        input.destroy();
        teardownHelp();
    };
}
