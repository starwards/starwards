// import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, GameStatus, Status, createLogger, spaceCommands } from '@starwards/core';
import { Dashboard, getGoldenLayoutItemConfig } from '../widgets/dashboard';
import { ScreenTeardown, runScreenLifecycle } from './station-lifecycle';

import { GmWidgets } from '../widgets/gm';
import { InputManager } from '../input/input-manager';
import { ammoWidget } from '../widgets/ammo';
import { armorWidget } from '../widgets/armor';
import { beginStationRegistrationWithRetry } from '../station-identity';
import { damageReportWidget } from '../widgets/damage-report';
import { designStateWidget } from '../widgets/design-state';
import { dockingWidget } from '../widgets/docking';
import { drawGmStatusChip } from '../widgets/observation-mode';
import { engineeringStatusWidget } from '../widgets/enginering-status';
import { fullSystemsStatusWidget } from '../widgets/full-system-status';
import { gameControlsWidget } from '../widgets/game-controls';
import { gameSetupWidget } from '../widgets/game-setup';
import { gmInputConfig } from '../input/input-config';
import { gunWidget } from '../widgets/gun';
import { longRangeRadarWidget } from '../widgets/long-range-radar';
import { monitorWidget } from '../widgets/monitor';
import { pilotRadarWidget } from '../widgets/pilot-radar';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { repairQueueWidget } from '../widgets/repair-queue';

import { setupHotkeyHelp } from '../input/hotkey-help';
import { stationRosterWidget } from '../widgets/station-roster';
import { systemsStatusWidget } from '../widgets/system-status';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetInfoWidget } from '../widgets/target-info';
import { targetRadarWidget } from '../widgets/target-radar';
import { targetingWidget } from '../widgets/targeting';
import { tubesStatusWidget } from '../widgets/tubes-status';
import { warpWidget } from '../widgets/warp';

const { error: logError } = createLogger('screen:gm');

// enable pixi dev-tools
// https://chrome.google.com/webstore/detail/pixijs-devtools/aamddddknhcagpehecnhphigffljadon
// window.PIXI = PIXI;
const driver = new Driver(window.location).connect();
const statusTracker = new ClientStatus(driver);

beginStationRegistrationWithRetry(driver, 'gm', '');

// GAME_RUNNING would hide the whole screen (roster included) until a game starts — but the GM
// needs the roster and game setup controls precisely to get a game started (issue #2132), so the
// gate drops to CONNECTED. Space-dependent widgets (radar, per-ship panels) already resolve
// asynchronously once a game exists; they just render empty until then.
runScreenLifecycle(driver, statusTracker, Status.CONNECTED, (wrapperEl) => initScreen(wrapperEl));

async function initScreen(wrapperEl: JQuery<HTMLElement>): Promise<ScreenTeardown> {
    wrapperEl.append('<ul id="menuContainer"></ul><div id="layoutContainer"></div>');
    const adminDriver = await driver.getAdminDriver();
    const gameSetup = gameSetupWidget(adminDriver);
    const gameControls = gameControlsWidget(adminDriver);
    const stationRoster = stationRosterWidget(driver, adminDriver);

    // `GmWidgets`' radar/tweak/create ask for a space room right away — fine once a game is
    // running, but while stopped there is no room to join, and `getSpaceDriver` treats that
    // absence as a connection failure (see `Driver.getSpaceDriver`), which would hide this very
    // screen. The roster and game setup controls the GM needs to *start* a game must render
    // regardless (#2132), so they render unconditionally and `GmWidgets` only once a game is
    // actually live; the status change to GAME_RUNNING re-runs this whole function anyway, at
    // which point the space room exists.
    const gameStatus = await driver.getGameStatus();
    const gameIsLive = gameStatus === GameStatus.RUNNING || gameStatus === GameStatus.REPLAY;
    const gmWidgets = gameIsLive ? new GmWidgets(driver) : null;

    // Its own row rather than a third tab: the GM has to see what the game is doing without
    // selecting anything, and a third tab in this column overflows into golden-layout's
    // dropdown, taking tweak and create with it. Game setup and the station roster get the
    // same treatment, for the same reason.
    const controlColumnContent = [
        { ...getGoldenLayoutItemConfig(gameSetup), height: 15, isClosable: false },
        { ...getGoldenLayoutItemConfig(gameControls), height: 25, isClosable: false },
        { ...getGoldenLayoutItemConfig(stationRoster), height: 20, isClosable: false },
    ];
    if (gmWidgets) {
        controlColumnContent.unshift({
            content: [
                { ...getGoldenLayoutItemConfig(gmWidgets.tweak), isClosable: false },
                { ...getGoldenLayoutItemConfig(gmWidgets.create), isClosable: false },
            ],
            height: 40,
            isClosable: false,
            title: '',
            type: 'stack',
        });
    }
    const controlColumn = { content: controlColumnContent, isClosable: false, title: '', type: 'column' as const };
    const dashboard = new Dashboard(
        {
            content: [
                gmWidgets
                    ? {
                          content: [
                              { ...getGoldenLayoutItemConfig(gmWidgets.radar), width: 80, isClosable: false },
                              { ...controlColumn, width: 20 },
                          ],
                          isClosable: false,
                          title: '',
                          type: 'row' as const,
                      }
                    : controlColumn,
            ],
        },
        wrapperEl.find('#layoutContainer'),
        wrapperEl.find('#menuContainer'),
    );

    if (gmWidgets) {
        dashboard.registerWidget(gmWidgets.radar);
        dashboard.registerWidget(gmWidgets.tweak);
        dashboard.registerWidget(gmWidgets.create);
    }
    dashboard.registerWidget(gameSetup);
    dashboard.registerWidget(gameControls);
    dashboard.registerWidget(stationRoster);
    drawGmStatusChip(adminDriver);

    dashboard.setup();
    if (!gmWidgets) {
        return () => dashboard.destroy();
    }

    const spaceDriver = await driver.getSpaceDriver();
    const input = new InputManager();
    input.addStepsAction(
        {
            setValue: (delta: number) =>
                spaceDriver.command(spaceCommands.bulkRotate, {
                    ids: gmWidgets.selectionContainer.selectedItemsIds,
                    delta,
                }),
        },
        gmInputConfig.rotate,
        'Rotate Selection',
    );
    input.addMomentaryClickAction(
        {
            setValue: (v: boolean) =>
                v &&
                spaceDriver.command(spaceCommands.bulkFreezeToggle, {
                    ids: gmWidgets.selectionContainer.selectedItemsIds,
                }),
        },
        gmInputConfig.toggleFreeze,
        'Toggle Freeze',
    );
    input.addMomentaryClickAction(
        {
            setValue: (v: boolean) =>
                v &&
                spaceDriver.command(spaceCommands.bulkDeleteOrder, {
                    ids: gmWidgets.selectionContainer.selectedItemsIds,
                }),
        },
        gmInputConfig.delete,
        'Delete Selection',
    );

    input.init();
    const teardownHelp = setupHotkeyHelp(input);

    // constantly scan for new ships and add widgets for them, until torn down
    let cancelled = false;
    void (async () => {
        for await (const shipId of driver.getUniqueShipIds()) {
            if (cancelled) break;
            const shipDriver = await driver.getShipDriver(shipId);
            if (cancelled) break;
            dashboard.registerWidget(radarWidget(spaceDriver, shipDriver), {}, shipId + ' radar');
            dashboard.registerWidget(tacticalRadarWidget(spaceDriver, shipDriver), {}, shipId + ' tactical radar');
            dashboard.registerWidget(pilotRadarWidget(spaceDriver, shipDriver), {}, shipId + ' pilot radar');
            dashboard.registerWidget(pilotWidget(shipDriver), {}, shipId + ' helm');
            dashboard.registerWidget(gunWidget(shipDriver), {}, shipId + ' gun');
            dashboard.registerWidget(designStateWidget(shipDriver), { shipDriver }, shipId + ' design state');
            dashboard.registerWidget(targetRadarWidget(spaceDriver, shipDriver), {}, shipId + ' target radar');
            dashboard.registerWidget(monitorWidget(shipDriver), {}, shipId + ' monitor');
            dashboard.registerWidget(damageReportWidget(shipDriver), {}, shipId + ' damage report');
            dashboard.registerWidget(repairQueueWidget(shipDriver), {}, shipId + ' repair queue');
            dashboard.registerWidget(armorWidget(shipDriver), {}, shipId + ' armor');
            dashboard.registerWidget(ammoWidget(shipDriver), {}, shipId + ' ammo');
            dashboard.registerWidget(tubesStatusWidget(shipDriver), {}, shipId + ' tubes');
            dashboard.registerWidget(systemsStatusWidget(shipDriver), {}, shipId + ' systems');
            dashboard.registerWidget(fullSystemsStatusWidget(shipDriver), {}, shipId + ' systems (full)');
            dashboard.registerWidget(engineeringStatusWidget(shipDriver), {}, shipId + ' engineering status');
            dashboard.registerWidget(targetingWidget(shipDriver), {}, shipId + ' targeting');
            if (shipDriver.state.warp) {
                dashboard.registerWidget(warpWidget(shipDriver), {}, shipId + ' warp');
            }
            dashboard.registerWidget(dockingWidget(spaceDriver, shipDriver), {}, shipId + ' docking');
            dashboard.registerWidget(targetInfoWidget(spaceDriver, shipDriver, driver), {}, shipId + ' target info');
            dashboard.registerWidget(longRangeRadarWidget(spaceDriver, shipDriver), {}, shipId + ' long range radar');
        }
    })().catch(logError);

    return () => {
        cancelled = true;
        input.destroy();
        teardownHelp();
        dashboard.destroy();
    };
}
