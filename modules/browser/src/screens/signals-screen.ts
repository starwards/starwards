import { Driver, Radar, ShipDriver, SpaceDriver, radarReach, scanCycleTargets } from '@starwards/core';
import { ScreenContainer, ScreenTeardown, setDisplayOnly } from './station-lifecycle';

import { cancelJobForTarget, drawSignalsJobs, prioritizeJobForTarget } from '../widgets/signals-jobs';
import { readWriteNumberProp, readWriteProp } from '../property-wrappers';

import EventEmitter from 'eventemitter3';
import { InputManager } from '../input/input-manager';
import { SelectionContainer } from '../radar/selection-container';
import { SignalsJobsLayer } from '../radar/signals-jobs-layer';
import { drawLongRangeRadar } from '../widgets/long-range-radar';
import { drawRadarHeader } from '../widgets/radar-header';
import { drawScanBeam } from '../widgets/scan-beam';
import { drawSystemsStatus } from '../widgets/system-status';
import { drawTargetInfo } from '../widgets/target-info';

import { setupHotkeyHelp } from '../input/hotkey-help';
import { shipInputConfig } from '../input/input-config';
import { stationGrid } from '../container';

type ZoomEvent = 'zoomIn' | 'zoomOut';

export async function initSignalsScreen(
    driver: Driver,
    container: ScreenContainer,
    shipId: string,
): Promise<ScreenTeardown> {
    setDisplayOnly(true, 'signals');
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();

    const stationTarget = new SelectionContainer().init(spaceDriver);
    const zoomEvents = new EventEmitter<ZoomEvent>();

    const radarRange = radarReach.longRange;
    const radar = await drawLongRangeRadar(
        spaceDriver,
        shipDriver,
        container,
        { range: radarRange },
        zoomEvents,
        stationTarget,
    );
    radar.addLayer(new SignalsJobsLayer(radar, spaceDriver, shipDriver).renderRoot);

    const grid = stationGrid(container, { left: 250, right: 256 });
    drawRadarHeader(grid.center({ fill: true }), `LONG RANGE · ${radarRange / 1000} KM`, `SHIP ${shipId}`);
    const radarSystems = shipDriver.systems.filter((s) => Radar.isInstance(s.state));
    const stationSystems = [...shipDriver.systems.filter((s) => s.pointer === '/signals'), ...radarSystems];
    const scanBeamSlot = grid.left();
    const jobsSlot = grid.left({ scroll: true });
    drawTargetInfo(grid.right(), driver, spaceDriver, shipDriver, stationTarget);
    drawSystemsStatus(grid.right({ scroll: true }), shipDriver, stationSystems, true);
    // the scan beam is the ship's steerable radar — the one whose arc has room to trade for reach
    const scanBeam = radarSystems.find(
        (s) => Radar.isInstance(s.state) && s.state.design.minArc < s.state.design.maxArc,
    );
    if (scanBeam && Radar.isInstance(scanBeam.state)) {
        drawScanBeam(scanBeamSlot, shipDriver, scanBeam.state, scanBeam.pointer);
    }
    drawSignalsJobs(jobsSlot, shipDriver, spaceDriver, stationTarget);
    return wireInput(spaceDriver, shipDriver, shipId, stationTarget, zoomEvents, scanBeam?.pointer);
}

function wireInput(
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    shipId: string,
    stationTarget: SelectionContainer,
    zoomEvents: EventEmitter<ZoomEvent>,
    beamPointer?: string,
): ScreenTeardown {
    let currentIndex = -1;

    function getTargets() {
        return scanCycleTargets(spaceDriver.state, shipDriver.state.faction, shipId);
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
    input.addClickAction(
        () => prioritizeJobForTarget(shipDriver, shipDriver.state.signals.jobs, stationTarget.getSingle()?.id),
        'p',
        'Prioritize Job',
    );
    input.addClickAction(
        () => cancelJobForTarget(shipDriver, shipDriver.state.signals.jobs, stationTarget.getSingle()?.id),
        'x',
        'Cancel Job',
    );
    input.addToggleClickAction(readWriteProp<boolean>(shipDriver, '/signals/jobsPaused'), 'z', 'Pause All Jobs');
    if (beamPointer) {
        input.addRangeAction(
            readWriteNumberProp(shipDriver, `${beamPointer}/bearingCommand`),
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
    const teardownHelp = setupHotkeyHelp(input);
    return () => {
        input.destroy();
        teardownHelp();
    };
}
