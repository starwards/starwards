import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, SpaceDriver, Status, Waypoint, createLogger } from '@starwards/core';
import { HPos, VPos, wrapRootWidgetContainer } from '../container';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import EventEmitter from 'eventemitter3';
import { InputManager } from '../input/input-manager';
import { RadarLayersPanel } from '../widgets/radar-layers';
import { SelectionContainer } from '../radar/selection-container';
import { WaypointGroupLayers } from '../radar/waypoint-group-layers';
import { WaypointPlacementLayer } from '../radar/waypoint-placement-layer';
import { WaypointSelectionLayer } from '../radar/waypoint-selection-layer';
import { drawRelayRadar } from '../widgets/relay-radar';
import { drawWaypointEdit } from '../widgets/waypoint-edit';
import { setupHotkeyHelp } from '../input/hotkey-help';

const { error: logError } = createLogger('screen:relay');

ElementQueries.listen();

// enable pixi dev-tools
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ && window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

const urlParams = new URLSearchParams(window.location.search);
const shipUrlParam = urlParams.get('ship');
if (shipUrlParam) {
    const driver = new Driver(window.location).connect();
    const statusTracker = new ClientStatus(driver, shipUrlParam);
    void driver.waitForShip(shipUrlParam).then(
        async () => {
            statusTracker.onStatusChange(({ status }) => {
                if (status !== Status.SHIP_FOUND) location.reload();
            });
            await initScreen(driver, shipUrlParam);
        },
        (e) => logError(e),
    );
} else {
    logError('missing "ship" url query param');
}

type ZoomEvent = 'zoomIn' | 'zoomOut';

async function initScreen(driver: Driver, shipId: string) {
    const container = wrapRootWidgetContainer($('#wrapper'));
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();

    const stationTarget = new SelectionContainer().init(spaceDriver);
    const zoomEvents = new EventEmitter<ZoomEvent>();

    const {
        root: radarView,
        layers,
        stopFollowingShip,
    } = await drawRelayRadar(spaceDriver, shipDriver, container, zoomEvents, stationTarget);
    container.getElement().on('contextmenu', (e) => e.preventDefault());

    const waypointSelection = new SelectionContainer().init(spaceDriver);
    const layersPanel = new RadarLayersPanel(container.subContainer(VPos.TOP, HPos.RIGHT));
    for (const [name, layer] of Object.entries(layers)) {
        layersPanel.addLayer(name, layer);
    }
    new WaypointGroupLayers(
        radarView,
        spaceDriver,
        shipId,
        waypointSelection,
        (name, layer, collection) =>
            layersPanel.addLayer(name, layer.renderRoot, (visible) => {
                if (!visible) {
                    // hiding a group layer drops its waypoints from the selection
                    const hidden = [...waypointSelection.selectedItems].filter(
                        (o) => Waypoint.isInstance(o) && o.collection === collection,
                    );
                    waypointSelection.remove(hidden);
                }
            }),
        (name) => layersPanel.removeLayer(name),
    );

    const selectionLayer = new WaypointSelectionLayer(
        radarView,
        spaceDriver,
        waypointSelection,
        shipId,
        undefined,
        stopFollowingShip,
    );
    radarView.addLayer(selectionLayer.renderRoot);

    const waypointLayer = new WaypointPlacementLayer(radarView, spaceDriver, shipId);
    radarView.addLayer(waypointLayer.renderRoot);

    drawWaypointEdit(container.subContainer(VPos.MIDDLE, HPos.RIGHT), spaceDriver, shipId, waypointSelection);
    wireInput(spaceDriver, shipId, stationTarget, zoomEvents, waypointLayer);
}

function wireInput(
    spaceDriver: SpaceDriver,
    shipId: string,
    stationTarget: SelectionContainer,
    zoomEvents: EventEmitter<ZoomEvent>,
    waypointLayer: WaypointPlacementLayer,
) {
    let currentIndex = -1;

    function getTargets() {
        return [...spaceDriver.state.getAll('Spaceship')].filter((s) => s.id !== shipId);
    }

    function cycleTarget(direction: 1 | -1) {
        const targets = getTargets();
        if (targets.length === 0) {
            stationTarget.clear();
            currentIndex = -1;
            return;
        }
        currentIndex += direction;
        if (currentIndex >= targets.length) {
            currentIndex = 0;
        } else if (currentIndex < 0) {
            currentIndex = targets.length - 1;
        }
        stationTarget.set([targets[currentIndex]]);
    }

    const input = new InputManager();
    input.addClickAction(() => cycleTarget(1), ']', 'Next Target');
    input.addClickAction(() => cycleTarget(-1), '[', 'Prev Target');
    input.addClickAction(
        () => {
            stationTarget.clear();
            currentIndex = -1;
        },
        "'",
        'Clear Target',
    );
    input.addClickAction(() => zoomEvents.emit('zoomIn'), '=', 'Zoom In');
    input.addClickAction(() => zoomEvents.emit('zoomOut'), '-', 'Zoom Out');
    input.addClickAction(() => waypointLayer.toggle(), 'w', 'Place Waypoint');
    input.init();
    setupHotkeyHelp(input);
}
