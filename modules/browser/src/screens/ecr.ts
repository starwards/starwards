import * as PIXI from 'pixi.js';

import { ClientStatus, Driver, Iterator, PowerLevelStep, ShipDriver, Status, WarpFrequency } from '@starwards/core';
import { radarFogOfWar, toCss } from '../colors';
import { readProp, readWriteNumberProp, readWriteProp, writeProp } from '../property-wrappers';

import $ from 'jquery';
import ElementQueries from 'css-element-queries/src/ElementQueries';
import { InputManager } from '../input/input-manager';
import { KeysRangeConfig } from '../input/input-config';
import { drawEngineeringStatus } from '../widgets/enginering-status';
import { drawFullSystemsStatus } from '../widgets/full-system-status';
import { drawWarpStatus } from '../widgets/warp';
import { wrapWidgetContainer } from '../container';

ElementQueries.listen();

// enable pixi dev-tools
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ && window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

// const style = document.createElement('style');
// style.innerHTML = `
//     .tableContainer {
//         width: 350px;
//     }
//     .tableContainer .tp-lblv_v {
//         min-width: fit-content;
//     }
// `;
// document.head.appendChild(style);

const urlParams = new URLSearchParams(window.location.search);
const isEcr = (urlParams.get('station') || '').toLowerCase() === 'ecr';
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
        // eslint-disable-next-line no-console
        (e) => console.error(e)
    );
} else {
    // eslint-disable-next-line no-console
    console.error('missing "ship" url query param');
}

async function initScreen(driver: Driver, shipId: string) {
    const container = wrapWidgetContainer($('#wrapper'));
    container.getElement().css('background-color', toCss(radarFogOfWar));
    const shipDriver = await driver.getShipDriver(shipId);
    wireInput(shipDriver);

    const topLeft = $('<div style="position: absolute; top:0; left:0;" />');
    container.getElement().append(topLeft);
    drawEngineeringStatus(wrapWidgetContainer(topLeft), shipDriver);

    const midLeft = $('<div style="position: absolute; top:50%; left:0;" />');
    container.getElement().append(midLeft);
    drawWarpStatus(wrapWidgetContainer(midLeft), shipDriver);

    const center = $('<div style="position: absolute; top:50%; left:50%; transform: translate(-50%, -50%);" />');
    container.getElement().append(center);
    drawFullSystemsStatus(wrapWidgetContainer(center), shipDriver, shipDriver.systems);
}

function wireInput(shipDriver: ShipDriver) {
    const controlledInput = new InputManager();
    const keyPairs: [string, string][] = [
        ['1', 'q'],
        ['2', 'w'],
        ['3', 'e'],
        ['4', 'r'],
        ['5', 't'],
        ['6', 'y'],
        ['7', 'u'],
        ['8', 'i'],
        ['9', 'o'],
        ['0', 'p'],
        ['a', 'z'],
        ['s', 'x'],
        ['d', 'c'],
        ['f', 'v'],
        ['g', 'b'],
        ['h', 'n'],
        ['j', 'm'],
        ['k', ','],
        ['l', '.'],
    ];
    for (const [system, keys] of new Iterator(shipDriver.systems).tuples(keyPairs)) {
        controlledInput.addRangeAction(readWriteNumberProp(shipDriver, `${system.pointer}/power`), {
            offsetKeys: new KeysRangeConfig(keys[0], keys[1], '', PowerLevelStep),
        });
        controlledInput.addRangeAction(readWriteNumberProp(shipDriver, `${system.pointer}/coolantFactor`), {
            offsetKeys: new KeysRangeConfig('shift+' + keys[0], 'shift+' + keys[1], '', 0.1),
        });
    }

    if (isEcr) {
        const ecrControlInput = new InputManager();
        ecrControlInput.addToggleClickAction(readWriteProp<boolean>(shipDriver, `/ecrControl`), '`');
        ecrControlInput.addRangeAction(
            {
                ...readWriteProp<number>(shipDriver, `/warp/standbyFrequency`),
                range: [0, WarpFrequency.WARP_FREQUENCY_COUNT - 1],
            },
            {
                offsetKeys: new KeysRangeConfig(']', '[', '', 1),
            }
        );
        ecrControlInput.addMomentaryClickAction(writeProp(shipDriver, `/warp/changeFrequencyCommand`), '\\');
        ecrControlInput.init();
    }
    const ecrControl = readProp<boolean>(shipDriver, `/ecrControl`);
    const updateControl = () => (ecrControl.getValue() === isEcr ? controlledInput.init() : controlledInput.destroy());
    ecrControl.onChange(updateControl);
    updateControl();
}
