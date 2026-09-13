import { Model, addBarBlade, addButton, addTextBlade, createWidgetPane } from '../panel';
import { RepairPriority, RepairProtocolStats, ShipDriver, repairCommands, repairProtocols } from '@starwards/core';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function repairQueueWidget(shipDriver: ShipDriver): DashboardWidget {
    class RepairQueueComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawRepairQueue(container, shipDriver, { interactive: true });
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
 * keyboard on per-system power/coolant pairs (see `engineer-screen.ts`'s `keyPairs`), so the
 * catalog gets its own modifier namespace rather than fighting over what's left. Alt (not Ctrl)
 * specifically: Ctrl+1..9 is bound to browser tab-switching in Chrome/Firefox and would never reach
 * the page. Assigned by fixed position in `repairProtocols` — which is also `RepairQueue.slots`'
 * order (`RepairManager` populates one slot per catalog entry, in catalog order) — so a protocol's
 * key never shifts as its refusal state changes; a protocol *added* to the catalog does shift every
 * key after it, same as inserting a row in the middle of any position-indexed list. Overflow past
 * the digit row spills onto the qwerty row.
 */
const REPAIR_PROTOCOL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'q', 'w', 'e', 'r', 't'];

/** The base key assigned to `protocolId` (e.g. `'4'`), or `undefined` past `REPAIR_PROTOCOL_KEYS`. */
function getRepairProtocolKey(
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): string | undefined {
    const index = Object.keys(catalog).indexOf(protocolId);
    return index >= 0 ? REPAIR_PROTOCOL_KEYS[index] : undefined;
}

/**
 * `alt+<key>` raises this protocol's priority (`OFF -> LOW -> MEDIUM -> HIGH`, clamped at `HIGH`);
 * `alt+shift+<key>` lowers it (the reverse, clamped at `OFF`). Either key on a `RUNNING` protocol
 * starts winding it down instead — see `RepairManager.applyCycle`.
 */
export function getRepairProtocolHotkeys(
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): { raise: string; lower: string } | undefined {
    const key = getRepairProtocolKey(protocolId, catalog);
    return key ? { raise: `alt+${key}`, lower: `alt+shift+${key}` } : undefined;
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

/** A read-only blade model for a value that never changes after the panel is drawn. */
function staticModel<T>(value: T): Model<T> {
    return { getValue: () => value, onChange: () => () => undefined };
}

type DrawRepairQueueOptions = {
    /**
     * Show per-protocol raise/lower click controls (issue #2212's click path, kept for the GM
     * screen, which has no engineering hotkeys). The Engineer screen omits these — hotkeys only
     * (see `engineer-screen.ts`'s `wireInput`) — so this panel is display-only there.
     */
    interactive?: boolean;
};

/**
 * Engineer damage-control panel (issue #2247): one row per catalog protocol. `RepairQueue.slots` is
 * fixed at ship creation (one slot per protocol, never added to or removed), so every row's
 * bindings are wired once here — no dynamic add/remove/reorder to track.
 */
export function drawRepairQueue(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    options: DrawRepairQueueOptions = {},
) {
    const { pane, cleanup } = createWidgetPane(container, 'Repair Queue');

    shipDriver.state.repairQueue.slots.forEach((slot, index) => {
        const protocolId = slot.protocolId;
        const protocol = (repairProtocols as Record<string, RepairProtocolStats>)[protocolId];
        const hotkeys = getRepairProtocolHotkeys(protocolId);
        const row = pane.addFolder({ title: protocolName(protocolId) });
        cleanup.add(() => row.dispose());

        // dynamicDuration (e.g. armorPlateRenewal's GM-tweakable Armor.plateRepairSeconds) always
        // overrides the static catalog number — same rule RepairManager.getDuration() applies. This
        // reference line is captured once at draw time, same as the rest of this summary.
        const duration = protocol?.dynamicDuration ? protocol.dynamicDuration(shipDriver.state) : protocol?.duration;
        const darkSystems = protocol?.sideEffectSystems.length
            ? `, dark: ${protocol.sideEffectSystems.join(', ')}`
            : '';
        // energyCells is finite (issue #2137) — shown so the crew can see how many jump-starts are
        // left before this protocol's toggle starts getting refused.
        const cells = protocol?.consumesEnergyCell
            ? `, cells: ${shipDriver.state.reactor.energyCells}/${shipDriver.state.reactor.design.maxEnergyCells}`
            : '';
        const keys = hotkeys ? `${hotkeys.raise.toUpperCase()} / ${hotkeys.lower.toUpperCase()}` : '—';
        const info = `${keys} · ${duration ?? '?'}s · ${protocol?.tier ?? '?'}${darkSystems}${cells}`;
        addTextBlade(row, staticModel(info), { label: 'info' }, cleanup.add);

        addTextBlade(
            row,
            readProp<RepairPriority>(shipDriver, `/repairQueue/slots/${index}/priority`),
            { label: 'priority', format: formatPriority },
            cleanup.add,
        );
        addBarBlade(
            row,
            readNumberProp(shipDriver, `/repairQueue/slots/${index}/progress`),
            { label: 'progress', format: (p: number) => `${Math.round(p * 100)}%` },
            cleanup.add,
        );
        // during the grace window before a sustained shortfall aborts the run
        // (RepairProtocolSlot.refusalReason only appears *after* that), this is the only visible
        // explanation for a progress bar that has stalled. Labeled "repair energy" (not the bare
        // "energy" the reactor's own readout already uses on Engineering Status) so the two rows
        // stay unambiguous to text-based lookups.
        addTextBlade(
            row,
            readProp<boolean>(shipDriver, `/repairQueue/slots/${index}/energyStarved`),
            { label: 'repair energy', format: (starved: boolean) => (starved ? 'insufficient reactor energy' : '') },
            cleanup.add,
        );
        addTextBlade(
            row,
            readProp<string>(shipDriver, `/repairQueue/slots/${index}/refusalReason`),
            { label: 'notice' },
            cleanup.add,
        );

        if (options.interactive) {
            addButton(
                row,
                () => shipDriver.command(repairCommands.cycleRepairPriority, { protocolId, direction: 'up' }),
                { label: '', title: 'Raise' },
                cleanup.add,
            );
            addButton(
                row,
                () => shipDriver.command(repairCommands.cycleRepairPriority, { protocolId, direction: 'down' }),
                { label: '', title: 'Lower' },
                cleanup.add,
            );
        }
    });
}
