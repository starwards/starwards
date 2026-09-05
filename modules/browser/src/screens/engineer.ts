import * as PIXI from 'pixi.js';

import {
    Driver,
    Iterator,
    PowerLevelStep,
    ShipDriver,
    Status,
    WarpFrequency,
    repairCommands,
    repairProtocols,
} from '@starwards/core';
import { HPos, VPos } from '../container';
import { ScreenContainer, ScreenTeardown, registerStationClient, runStationScreen } from './station-lifecycle';
import { drawRepairQueue, getRepairProtocolHotkey } from '../widgets/repair-queue';
import { radarFogOfWar, toCss } from '../colors';
import { readWriteNumberProp, readWriteProp, writeProp } from '../property-wrappers';

import ElementQueries from 'css-element-queries/src/ElementQueries';
import { InputManager } from '../input/input-manager';
import { KeysRangeConfig } from '../input/input-config';
import { drawArmorStatus } from '../widgets/armor';
import { drawDamageReport } from '../widgets/damage-report';
import { drawEngineeringStatus } from '../widgets/enginering-status';
import { drawFullSystemsStatus } from '../widgets/full-system-status';
import { drawStationObservationMode } from '../widgets/observation-mode';
import { drawWarpStatus } from '../widgets/warp';
import { setupHotkeyHelp } from '../input/hotkey-help';

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

const requestedShipId = new URLSearchParams(window.location.search).get('ship') ?? '';
const driver = new Driver(window.location).connect();
const { statusTracker, getAssignedShipId } = registerStationClient(driver, 'engineer', requestedShipId);
runStationScreen(driver, statusTracker, Status.SHIP_FOUND, async (container) =>
    initScreen(await getAssignedShipId(), container),
);

async function initScreen(shipId: string, container: ScreenContainer): Promise<ScreenTeardown> {
    container.getElement().css('background-color', toCss(radarFogOfWar));
    const shipDriver = await driver.getShipDriver(shipId);
    const teardownInput = wireInput(shipDriver);

    drawEngineeringStatus(container.subContainer(VPos.TOP, HPos.LEFT), shipDriver);
    if (shipDriver.state.warp) {
        drawWarpStatus(container.subContainer(VPos.MIDDLE, HPos.LEFT), shipDriver);
    }
    drawFullSystemsStatus(container.subContainer(VPos.MIDDLE, HPos.MIDDLE), shipDriver, shipDriver.systems);
    await drawArmorStatus(container.subContainer(VPos.BOTTOM, HPos.LEFT), shipDriver, 200);
    drawDamageReport(container.subContainer(VPos.TOP, HPos.RIGHT), shipDriver);
    drawRepairQueue(container.subContainer(VPos.MIDDLE, HPos.RIGHT), shipDriver);
    await drawStationObservationMode(container.subContainer(VPos.TOP, HPos.MIDDLE), driver);
    return teardownInput;
}

function systemLabel(pointer: string): string {
    const parts = pointer.split('/').filter(Boolean);
    return parts
        .map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2'))
        .join(' ')
        .replace(/^\w/, (c) => c.toUpperCase());
}

function wireInput(shipDriver: ShipDriver): ScreenTeardown {
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
        const name = systemLabel(system.pointer);
        controlledInput.addRangeAction(
            readWriteNumberProp(shipDriver, `${system.pointer}/power`),
            { offsetKeys: new KeysRangeConfig(keys[0], keys[1], '', PowerLevelStep) },
            `${name} Power`,
        );
        controlledInput.addRangeAction(
            readWriteNumberProp(shipDriver, `${system.pointer}/coolantFactor`),
            { offsetKeys: new KeysRangeConfig('shift+' + keys[0], 'shift+' + keys[1], '', 0.1) },
            `${name} Coolant`,
        );
    }

    // repair-protocol catalog is a display-only readout (widgets/repair-queue.ts); enqueueing is
    // hotkey-driven here, on the same manager as power/coolant, since it's the same kind of
    // engineering action. Bound unconditionally (not only for currently-available protocols) — the
    // server refuses an unavailable protocol with a visible notice, same as it already does for a
    // full queue, so a docked-tier key pressed while undocked is a no-op, not a crash.
    for (const [protocolId, protocol] of Object.entries(repairProtocols)) {
        const key = getRepairProtocolHotkey(protocolId);
        if (key) {
            controlledInput.addClickAction(
                () => shipDriver.command(repairCommands.enqueueRepair, { protocolId }),
                key,
                `Enqueue: ${protocol.name}`,
            );
        }
    }

    if (shipDriver.state.warp) {
        controlledInput.addRangeAction(
            {
                ...readWriteProp<number>(shipDriver, `/warp/standbyFrequency`),
                range: [0, WarpFrequency.WARP_FREQUENCY_COUNT - 1],
            },
            {
                offsetKeys: new KeysRangeConfig(']', '[', '', 1),
            },
            'Warp Frequency',
        );
        controlledInput.addMomentaryClickAction(
            writeProp(shipDriver, `/warp/changeFrequencyCommand`),
            '\\',
            'Change Frequency',
        );
    }

    const teardownHelp = setupHotkeyHelp(controlledInput);
    controlledInput.init();

    return () => {
        controlledInput.destroy();
        teardownHelp();
    };
}
