import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, SpaceDriver, Status, createLogger } from '@starwards/core';
import { HPos, VPos, wrapRootWidgetContainer } from '../container';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import EventEmitter from 'eventemitter3';
import { InputManager } from '../input/input-manager';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import { WaypointPlacementLayer } from '../radar/waypoint-placement-layer';
import { drawLongRangeRadar } from '../widgets/long-range-radar';
import { drawSystemsStatus } from '../widgets/system-status';
import { drawTargetInfo } from '../widgets/target-info';
import { drawWaypointList } from '../widgets/waypoint-list';
import { setupHotkeyHelp } from '../input/hotkey-help';
import { tacticalDrawWaypoints } from '../radar/blips/blip-renderer';

const { error: logError } = createLogger('screen:signals');

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

    const radarView = await drawLongRangeRadar(
        spaceDriver,
        shipDriver,
        container,
        { range: 50_000 },
        zoomEvents,
        stationTarget,
    );
    const waypointLayer = new WaypointPlacementLayer(radarView, spaceDriver, shipId);
    radarView.addLayer(waypointLayer.renderRoot);

    const waypointsLayer = new ObjectsLayer(
        radarView,
        spaceDriver,
        32,
        (w) => w.color,
        tacticalDrawWaypoints,
        undefined,
        (w) => w.owner === shipId,
    );
    radarView.addLayer(waypointsLayer.renderRoot);

    drawTargetInfo(container.subContainer(VPos.TOP, HPos.LEFT), spaceDriver, shipDriver, stationTarget);
    drawSystemsStatus(
        container.subContainer(VPos.TOP, HPos.RIGHT),
        shipDriver,
        shipDriver.systems.filter((s) => s.pointer === '/radar'),
    );
    drawWaypointList(container.subContainer(VPos.BOTTOM, HPos.LEFT), spaceDriver, shipId);
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
