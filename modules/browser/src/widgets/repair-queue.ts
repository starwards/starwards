import { RepairPriority, RepairProtocolStats, ShipDriver, repairCommands, repairProtocols } from '@starwards/core';
import { addBarBlade, addButton, addTextBlade, createWidgetPane } from '../panel';
import { aggregate, readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function repairQueueWidget(shipDriver: ShipDriver): DashboardWidget {
    class RepairQueueComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawRepairQueue(container, shipDriver, true);
        }
    }
    return {
        name: 'repair queue',
        type: 'component',
        component: RepairQueueComponent,
        defaultProps: {},
    };
}

/**
 * Engineer screen is the only bearer of engineering hotkeys and already exhausts the alphanumeric
 * keyboard on per-system power/coolant pairs (see `engineer.ts`'s `keyPairs`), so the catalog gets its
 * own modifier namespace rather than fighting over what's left. Alt (not Ctrl) specifically:
 * Ctrl+1..9 is bound to browser tab-switching in Chrome/Firefox and would never reach the page.
 * Assigned by fixed position in `repairProtocols` (not a per-ship filtered/visible subset — every
 * catalog protocol always gets a slot, see issue #2247), so a protocol's key never shifts as
 * tier/equipment availability changes its refusal in and out; a protocol *added* to the catalog does
 * shift every key after it, same as inserting a row in the middle of any position-indexed list;
 * overflow past the digit row spills onto the qwerty row.
 */
const REPAIR_PROTOCOL_HOTKEYS = [
    'alt+1',
    'alt+2',
    'alt+3',
    'alt+4',
    'alt+5',
    'alt+6',
    'alt+7',
    'alt+8',
    'alt+9',
    'alt+0',
    'alt+q',
    'alt+w',
    'alt+e',
    'alt+r',
    'alt+t',
];

/** The raise hotkey assigned to `protocolId`, or `undefined` if the catalog has grown past `REPAIR_PROTOCOL_HOTKEYS`. */
export function getRepairProtocolHotkey(
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): string | undefined {
    const index = Object.keys(catalog).indexOf(protocolId);
    return index >= 0 ? REPAIR_PROTOCOL_HOTKEYS[index] : undefined;
}

/** The lower hotkey for `protocolId` — the same digit/letter as the raise hotkey, with `shift` added. */
export function getRepairProtocolLowerHotkey(
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): string | undefined {
    const raise = getRepairProtocolHotkey(protocolId, catalog);
    return raise ? raise.replace('alt+', 'alt+shift+') : undefined;
}

function formatPriority(priority: RepairPriority): string {
    switch (priority) {
        case RepairPriority.OFF:
            return 'OFF';
        case RepairPriority.LOW:
            return 'LOW';
        case RepairPriority.MEDIUM:
            return 'MEDIUM';
        case RepairPriority.HIGH:
            return 'HIGH';
        case RepairPriority.RUNNING:
            return 'RUNNING';
        case RepairPriority.CANCELLING:
            return 'CANCELLING';
        default:
            return String(priority);
    }
}

function protocolName(protocolId: string): string {
    return (repairProtocols as Record<string, { name: string }>)[protocolId]?.name ?? protocolId;
}

function protocolSummary(protocolId: string, shipDriver: ShipDriver): string {
    const protocol = (repairProtocols as Record<string, RepairProtocolStats>)[protocolId];
    if (!protocol) {
        return '';
    }
    // dynamicDuration (e.g. armorPlateRenewal's GM-tweakable Armor.plateRepairSeconds) always
    // overrides the static catalog number — same rule RepairManager.getDuration() applies.
    const duration = protocol.dynamicDuration ? protocol.dynamicDuration(shipDriver.state) : protocol.duration;
    const darkSystems = protocol.sideEffectSystems.length ? `, dark: ${protocol.sideEffectSystems.join(', ')}` : '';
    // energyCells is finite (issue #2137) — shown so the crew can see how many jump-starts are
    // left before this protocol's priority can no longer be raised.
    const cells = protocol.consumesEnergyCell
        ? `, cells: ${shipDriver.state.reactor.energyCells}/${shipDriver.state.reactor.design.maxEnergyCells}`
        : '';
    return `${duration}s · ${protocol.tier}${darkSystems}${cells}`;
}

/**
 * Engineer damage-control panel (issue #2247): one row per catalog protocol — a fixed set, in
 * catalog order — each showing its priority (OFF/LOW/MEDIUM/HIGH/RUNNING/CANCELLING), progress
 * while running, and the reason the last priority change was refused. `slots` never grows or
 * shrinks after ship construction, so every row is built once; each blade live-binds its own field.
 *
 * `interactive` adds per-row raise/lower buttons for the GM screen (issue #2212's click path). The
 * engineer screen renders with `interactive: false` — hotkeys only, wired in `engineer-screen.ts`.
 */
export function drawRepairQueue(container: WidgetContainer, shipDriver: ShipDriver, interactive: boolean) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Repair Queue');

    shipDriver.state.repairQueue.slots.forEach((slot, index) => {
        const hotkeys = interactive
            ? ''
            : ` (${getRepairProtocolHotkey(slot.protocolId)?.toUpperCase() ?? '—'}/${getRepairProtocolLowerHotkey(slot.protocolId)?.toUpperCase() ?? '—'})`;
        const row = pane.addFolder({ title: `${protocolName(slot.protocolId)}${hotkeys}` });
        panelCleanup.add(() => row.dispose());

        // reactor.energyCells and armor.plateRepairSeconds are the only catalog-summary inputs that
        // change live (a dynamicDuration protocol's duration, or how many jump-starts are left) —
        // aggregate() re-renders this text whenever either actually changes value.
        addTextBlade(
            row,
            aggregate(
                [readProp(shipDriver, '/reactor/energyCells'), readProp(shipDriver, '/armor/plateRepairSeconds')],
                () => protocolSummary(slot.protocolId, shipDriver),
            ),
            { label: 'details' },
            panelCleanup.add,
        );
        addTextBlade(
            row,
            readProp<RepairPriority>(shipDriver, `/repairQueue/slots/${index}/priority`),
            { label: 'priority', format: formatPriority },
            panelCleanup.add,
        );
        addBarBlade(
            row,
            readNumberProp(shipDriver, `/repairQueue/slots/${index}/progress`),
            { label: 'progress', format: (p: number) => `${Math.round(p * 100)}%` },
            panelCleanup.add,
        );
        // during the grace window before a sustained shortfall force-stops the run
        // (RepairProtocolSlot.refusalReason only appears *after* that), this is the only visible
        // explanation for a progress bar that has stalled.
        addTextBlade(
            row,
            readProp<boolean>(shipDriver, `/repairQueue/slots/${index}/energyStarved`),
            { label: 'repair energy', format: (starved: boolean) => (starved ? 'insufficient reactor energy' : '') },
            panelCleanup.add,
        );
        addTextBlade(
            row,
            readProp<string>(shipDriver, `/repairQueue/slots/${index}/refusalReason`),
            { label: 'notice' },
            panelCleanup.add,
        );
        if (interactive) {
            addButton(
                row,
                () =>
                    shipDriver.command(repairCommands.cycleRepairPriority, {
                        protocolId: slot.protocolId,
                        direction: 'up',
                    }),
                { label: '', title: 'Raise priority' },
                panelCleanup.add,
            );
            addButton(
                row,
                () =>
                    shipDriver.command(repairCommands.cycleRepairPriority, {
                        protocolId: slot.protocolId,
                        direction: 'down',
                    }),
                { label: '', title: 'Lower priority' },
                panelCleanup.add,
            );
        }
    });
}
