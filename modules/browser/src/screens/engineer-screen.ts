import {
    Driver,
    Iterator,
    PowerLevelStep,
    ShipDriver,
    WarpFrequency,
    repairCommands,
    repairProtocols,
} from '@starwards/core';
import { HPos, VPos } from '../container';
import { ScreenContainer, ScreenTeardown } from './station-lifecycle';
import {
    getRepairProtocolHotkey,
    getRepairProtocolLowerHotkey,
    getRepairProtocolModeHotkey,
} from '../widgets/repair-queue-logic';
import { radarFogOfWar, toCss } from '../colors';
import { readWriteNumberProp, readWriteProp, writeProp } from '../property-wrappers';

import { InputManager } from '../input/input-manager';
import { KeysRangeConfig } from '../input/input-config';
import { drawArmorStatus } from '../widgets/armor';
import { drawDamageReport } from '../widgets/damage-report';
import { drawEngineeringStatus } from '../widgets/enginering-status';
import { drawFullSystemsStatus } from '../widgets/full-system-status';
import { drawRepairQueue } from '../widgets/repair-queue';
import { drawStationObservationMode } from '../widgets/observation-mode';
import { drawWarpStatus } from '../widgets/warp';
import { setupHotkeyHelp } from '../input/hotkey-help';

export async function initEngineerScreen(
    driver: Driver,
    container: ScreenContainer,
    shipId: string,
): Promise<ScreenTeardown> {
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
    drawRepairQueue(container.subContainer(VPos.MIDDLE, HPos.RIGHT), shipDriver, false);
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

    // repair-protocol priority (widgets/repair-queue.ts renders it, hotkey-only here): alt+<n>
    // raises OFF->LOW->MEDIUM->HIGH (or starts wind-down if RUNNING), alt+shift+<n> lowers the
    // other way, on the same manager as power/coolant since it's the same kind of engineering
    // action (issue #2247). Bound unconditionally (not only for currently-available protocols) —
    // the server refuses an unavailable protocol with a visible per-slot notice, so a docked-tier
    // key pressed while undocked is a no-op, not a crash.
    for (const [protocolId, protocol] of Object.entries(repairProtocols)) {
        const raiseKey = getRepairProtocolHotkey(protocolId);
        const lowerKey = getRepairProtocolLowerHotkey(protocolId);
        if (raiseKey) {
            controlledInput.addClickAction(
                () => shipDriver.command(repairCommands.cycleRepairPriority, { protocolId, direction: 'up' }),
                raiseKey,
                `Raise priority: ${protocol.name}`,
            );
        }
        if (lowerKey) {
            controlledInput.addClickAction(
                () => shipDriver.command(repairCommands.cycleRepairPriority, { protocolId, direction: 'down' }),
                lowerKey,
                `Lower priority: ${protocol.name}`,
            );
        }
        // mode toggle (issue #2255): a third gesture per row, ctrl+alt+<key> — a docked/shipyard-tier
        // protocol has no mode to toggle, so getRepairProtocolModeHotkey (and this binding) only
        // exist for a field-tier one.
        const modeKey = getRepairProtocolModeHotkey(protocolId);
        if (modeKey) {
            controlledInput.addClickAction(
                () => shipDriver.command(repairCommands.toggleRepairProtocolMode, { protocolId }),
                modeKey,
                `Toggle Responsive/Dark: ${protocol.name}`,
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
