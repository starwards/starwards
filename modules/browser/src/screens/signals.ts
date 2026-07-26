import * as PIXI from 'pixi.js';

import {
    ClientStatus,
    Destructors,
    Driver,
    Radar,
    ShipDriver,
    SpaceDriver,
    Status,
    createLogger,
} from '@starwards/core';
import { HPos, VPos, WidgetContainer, wrapRootWidgetContainer } from '../container';
import { addSliderBlade, createPane } from '../panel';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import EventEmitter from 'eventemitter3';
import { InputManager } from '../input/input-manager';
import { SelectionContainer } from '../radar/selection-container';
import { drawLongRangeRadar } from '../widgets/long-range-radar';
import { drawSystemsStatus } from '../widgets/system-status';
import { drawTargetInfo } from '../widgets/target-info';
import { readWriteNumberProp } from '../property-wrappers';
import { setupHotkeyHelp } from '../input/hotkey-help';
import { shipInputConfig } from '../input/input-config';

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

    await drawLongRangeRadar(spaceDriver, shipDriver, container, { range: 50_000 }, zoomEvents, stationTarget);

    drawTargetInfo(container.subContainer(VPos.TOP, HPos.LEFT), spaceDriver, shipDriver, stationTarget);
    const radarSystems = shipDriver.systems.filter((s) => Radar.isInstance(s.state));
    drawSystemsStatus(container.subContainer(VPos.TOP, HPos.RIGHT), shipDriver, radarSystems);
    // the scan beam is the ship's steerable radar — the one whose arc has room to trade for reach
    const scanBeam = radarSystems.find(
        (s) => Radar.isInstance(s.state) && s.state.design.minArc < s.state.design.maxArc,
    );
    if (scanBeam) {
        drawScanBeamControls(container.subContainer(VPos.BOTTOM, HPos.RIGHT), shipDriver, scanBeam.pointer);
    }
    wireInput(spaceDriver, shipDriver, shipId, stationTarget, zoomEvents, scanBeam?.pointer);
}

function drawScanBeamControls(container: WidgetContainer, shipDriver: ShipDriver, beamPointer: string) {
    const panelCleanup = new Destructors();
    const pane = createPane({ title: 'Scan Beam', container: container.getElement().get(0) });
    panelCleanup.add(() => pane.dispose());
    container.on('destroy', panelCleanup.destroy);
    addSliderBlade(
        pane,
        readWriteNumberProp(shipDriver, `${beamPointer}/directionCommand`),
        { label: 'direction' },
        panelCleanup.add,
    );
    addSliderBlade(pane, readWriteNumberProp(shipDriver, `${beamPointer}/arc`), { label: 'arc' }, panelCleanup.add);
}

function wireInput(
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    shipId: string,
    stationTarget: SelectionContainer,
    zoomEvents: EventEmitter<ZoomEvent>,
    beamPointer?: string,
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
    if (beamPointer) {
        input.addRangeAction(
            readWriteNumberProp(shipDriver, `${beamPointer}/directionCommand`),
            shipInputConfig.radarDirection,
            'Beam Direction',
        );
        input.addRangeAction(
            readWriteNumberProp(shipDriver, `${beamPointer}/arc`),
            shipInputConfig.radarArc,
            'Beam Arc',
        );
    }
    input.init();
    setupHotkeyHelp(input);
}
