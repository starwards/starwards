// import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, Status, spaceCommands } from '@starwards/core';
import { Dashboard, getGoldenLayoutItemConfig } from '../widgets/dashboard';

import $ from 'jquery';
import { GmWidgets } from '../widgets/gm';
import { InputManager } from '../input/input-manager';
import { ammoWidget } from '../widgets/ammo';
import { armorWidget } from '../widgets/armor';
import { damageReportWidget } from '../widgets/damage-report';
import { designStateWidget } from '../widgets/design-state';
import { dockingWidget } from '../widgets/docking';
import { engineeringStatusWidget } from '../widgets/enginering-status';
import { fullSystemsStatusWidget } from '../widgets/full-system-status';
import { gmInputConfig } from '../input/input-config';
import { gunWidget } from '../widgets/gun';
import { monitorWidget } from '../widgets/monitor';
import { pilotRadarWidget } from '../widgets/pilot-radar';
import { pilotWidget } from '../widgets/pilot';
import { radarWidget } from '../widgets/radar';
import { systemsStatusWidget } from '../widgets/system-status';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetRadarWidget } from '../widgets/target-radar';
import { targetingWidget } from '../widgets/targeting';
import { tubesStatusWidget } from '../widgets/tubes-status';
import { warpWidget } from '../widgets/warp';

// enable pixi dev-tools
// https://chrome.google.com/webstore/detail/pixijs-devtools/aamddddknhcagpehecnhphigffljadon
// window.PIXI = PIXI;
const driver = new Driver(window.location).connect();
const statusTracker = new ClientStatus(driver);

void driver.waitForGame().then(
    async () => {
        statusTracker.onStatusChange(({ status }) => {
            if (status !== Status.GAME_RUNNING) location.reload();
        });
        const gmWidgets = new GmWidgets(driver);
        const dashboard = new Dashboard(
            {
                content: [
                    {
                        content: [
                            { ...getGoldenLayoutItemConfig(gmWidgets.radar), width: 80 },
                            {
                                content: [
                                    { ...getGoldenLayoutItemConfig(gmWidgets.tweak) },
                                    { ...getGoldenLayoutItemConfig(gmWidgets.create) },
                                ],
                                isClosable: true,
                                title: '',
                                type: 'stack',
                                width: 20,
                            },
                        ],
                        isClosable: true,
                        title: '',
                        type: 'row',
                    },
                ],
            },
            $('#layoutContainer'),
            $('#menuContainer'),
        );

        dashboard.registerWidget(gmWidgets.radar);
        dashboard.registerWidget(gmWidgets.tweak);
        dashboard.registerWidget(gmWidgets.create);

        dashboard.setup();
        // constantly scan for new ships and add widgets for them
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
        );

        input.init();

        for await (const shipId of driver.getUniqueShipIds()) {
            const shipDriver = await driver.getShipDriver(shipId);
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
            dashboard.registerWidget(warpWidget(shipDriver), {}, shipId + ' warp');
            dashboard.registerWidget(dockingWidget(spaceDriver, shipDriver), {}, shipId + ' docking');
            dashboard.setup();
        }
    },
    // eslint-disable-next-line no-console
    (e) => console.error(e),
);
