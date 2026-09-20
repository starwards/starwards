import {
    RepairPriority,
    RepairProtocolMode,
    RepairProtocolStats,
    ShipDriver,
    getModeStats,
    repairCommands,
    repairProtocols,
} from '@starwards/core';
import { addBarBlade, addButton, addTextBlade, createWidgetPane } from '../panel';
import { aggregate, readNumberProp, readProp } from '../property-wrappers';
import {
    getRepairProtocolHotkey,
    getRepairProtocolLowerHotkey,
    getRepairProtocolModeHotkey,
    isRepairSlotVisible,
} from './repair-queue-logic';

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

function formatMode(mode: RepairProtocolMode): string {
    return mode === RepairProtocolMode.Dark ? 'DARK' : 'RESPONSIVE';
}

/** `protocolSummary` reads the slot's *current* mode (issue #2255) — a field-tier row's price changes as the crew toggles it. */
function protocolSummary(protocolId: string, mode: RepairProtocolMode, shipDriver: ShipDriver): string {
    const protocol = (repairProtocols as Record<string, RepairProtocolStats>)[protocolId];
    if (!protocol) {
        return '';
    }
    const modeStats = getModeStats(protocol, mode);
    // dynamicDuration (e.g. armorPlateRenewal's GM-tweakable Armor.plateRepairSeconds) always
    // overrides the mode's static catalog number — same rule RepairManager.getDuration() applies.
    const duration = protocol.dynamicDuration ? protocol.dynamicDuration(shipDriver.state) : modeStats.duration;
    const darkSystems = modeStats.sideEffectSystems.length ? `, dark: ${modeStats.sideEffectSystems.join(', ')}` : '';
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
        if (!isRepairSlotVisible(shipDriver.state, slot.protocolId)) {
            // this ship structurally lacks the equipment this protocol needs (e.g. no chain gun) —
            // never shows, unlike a tier- or energy-cell-gated protocol, which stays visible and
            // explains itself through refusalReason (issue #2247 review)
            return;
        }
        const modeHotkey = interactive ? undefined : getRepairProtocolModeHotkey(slot.protocolId);
        const hotkeys = interactive
            ? ''
            : ` (${getRepairProtocolHotkey(slot.protocolId)?.toUpperCase() ?? '—'}/${getRepairProtocolLowerHotkey(slot.protocolId)?.toUpperCase() ?? '—'}${modeHotkey ? `/${modeHotkey.toUpperCase()}` : ''})`;
        const row = pane.addFolder({ title: `${protocolName(slot.protocolId)}${hotkeys}` });
        panelCleanup.add(() => row.dispose());

        // reactor.energyCells, armor.plateRepairSeconds and this slot's own mode are the only
        // catalog-summary inputs that change live (a dynamicDuration protocol's duration, how many
        // jump-starts are left, or a field-tier row's Responsive/Dark price) — aggregate()
        // re-renders this text whenever any of them actually change value.
        addTextBlade(
            row,
            aggregate(
                [
                    readProp(shipDriver, '/reactor/energyCells'),
                    readProp(shipDriver, '/armor/plateRepairSeconds'),
                    readProp(shipDriver, `/repairQueue/slots/${index}/mode`),
                ],
                () =>
                    protocolSummary(
                        slot.protocolId,
                        shipDriver.state.repairQueue.slots[index]?.mode ?? RepairProtocolMode.Responsive,
                        shipDriver,
                    ),
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
        // a docked/shipyard-tier slot's `mode` field exists on the schema but is meaningless (see
        // RepairProtocolSlot.mode) — getRepairProtocolModeHotkey (and this row) only exist for a
        // field-tier protocol, the one kind that actually has two modes to show or toggle between.
        if (getRepairProtocolModeHotkey(slot.protocolId)) {
            addTextBlade(
                row,
                readProp<RepairProtocolMode>(shipDriver, `/repairQueue/slots/${index}/mode`),
                { label: 'mode', format: formatMode },
                panelCleanup.add,
            );
            if (interactive) {
                addButton(
                    row,
                    () => shipDriver.command(repairCommands.toggleRepairProtocolMode, { protocolId: slot.protocolId }),
                    { label: '', title: 'Toggle Responsive/Dark mode' },
                    panelCleanup.add,
                );
            }
        }
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
