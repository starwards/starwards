// import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, Status, createLogger, spaceCommands } from '@starwards/core';
import { Dashboard, getGoldenLayoutItemConfig } from '../widgets/dashboard';
import { ScreenTeardown, runScreenLifecycle } from './station-lifecycle';

import { GmWidgets } from '../widgets/gm';
import { InputManager } from '../input/input-manager';
import { ammoWidget } from '../widgets/ammo';
import { armorWidget } from '../widgets/armor';
import { damageReportWidget } from '../widgets/damage-report';
import { designStateWidget } from '../widgets/design-state';
import { dockingWidget } from '../widgets/docking';
import { drawGmStatusChip } from '../widgets/observation-mode';
import { engineeringStatusWidget } from '../widgets/enginering-status';
import { fullSystemsStatusWidget } from '../widgets/full-system-status';
import { gameControlsWidget } from '../widgets/game-controls';
import { gmInputConfig } from '../input/input-config';
import { gunWidget } from '../widgets/gun';
import { longRangeRadarWidget } from '../widgets/long-range-radar';
import { monitorWidget } from '../widgets/monitor';
import { pilotRadarWidget } from '../widgets/pilot-radar';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';

import { setupHotkeyHelp } from '../input/hotkey-help';
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

runScreenLifecycle(statusTracker, Status.GAME_RUNNING, (wrapperEl) => initScreen(wrapperEl));

async function initScreen(wrapperEl: JQuery<HTMLElement>): Promise<ScreenTeardown> {
    wrapperEl.append('<ul id="menuContainer"></ul><div id="layoutContainer"></div>');
    const gmWidgets = new GmWidgets(driver);
    const adminDriver = await driver.getAdminDriver();
    const gameControls = gameControlsWidget(adminDriver);
    const dashboard = new Dashboard(
        {
            content: [
                {
                    content: [
                        { ...getGoldenLayoutItemConfig(gmWidgets.radar), width: 80, isClosable: false },
                        {
                            content: [
                                {
                                    content: [
                                        { ...getGoldenLayoutItemConfig(gmWidgets.tweak), isClosable: false },
                                        { ...getGoldenLayoutItemConfig(gmWidgets.create), isClosable: false },
                                    ],
                                    height: 70,
                                    isClosable: false,
                                    title: '',
                                    type: 'stack',
                                },
                                // Its own row rather than a third tab: the GM has to see what
                                // the game is doing without selecting anything, and a third
                                // tab in this column overflows into golden-layout's dropdown,
                                // taking tweak and create with it.
                                {
                                    ...getGoldenLayoutItemConfig(gameControls),
                                    height: 30,
                                    isClosable: false,
                                },
                            ],
                            isClosable: false,
                            title: '',
                            type: 'column',
                            width: 20,
                        },
                    ],
                    isClosable: false,
                    title: '',
                    type: 'row',
                },
            ],
        },
        wrapperEl.find('#layoutContainer'),
        wrapperEl.find('#menuContainer'),
    );

    dashboard.registerWidget(gmWidgets.radar);
    dashboard.registerWidget(gmWidgets.tweak);
    dashboard.registerWidget(gmWidgets.create);
    dashboard.registerWidget(gameControls);
    drawGmStatusChip(adminDriver);

    dashboard.setup();
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
