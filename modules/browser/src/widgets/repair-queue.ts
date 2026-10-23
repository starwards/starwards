import {
    Destructor,
    RTuple2,
    RepairPriority,
    RepairProtocolMode,
    RepairProtocolStats,
    ShipDriver,
    getModeStats,
    repairCommands,
    repairProtocols,
} from '@starwards/core';
import { FolderApi, Pane } from 'tweakpane';
import { Model, addBarBlade, addBareBarBlade, addButton, addTextBlade, createWidgetPane } from '../panel';
import { aggregate, readNumberProp, readProp } from '../property-wrappers';
import {
    formatRepairPriority as formatPriority,
    formatRepairUpNextEntry,
    getRepairProtocolHotkey,
    getRepairProtocolKeyLabel,
    getRepairProtocolModeHotkey,
    getRepairUpNext,
    isRepairSlotVisible,
    repairSlotExpansion,
    repairSlotTitle,
    wantsRepairSlotOpen,
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

function protocolName(protocolId: string): string {
    return (repairProtocols as Record<string, { name: string }>)[protocolId]?.name ?? protocolId;
}

function formatMode(mode: RepairProtocolMode): string {
    return mode === RepairProtocolMode.Dark ? 'DARK' : 'RESPONSIVE';
}

function formatClock(seconds: number): string {
    const whole = Math.max(0, Math.ceil(seconds));
    const minutes = String(Math.floor(whole / 60)).padStart(2, '0');
    return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/** Seconds a run takes in the slot's *current* mode (issue #2255) — a field-tier row's price changes as the crew toggles it. */
function protocolDuration(protocolId: string, mode: RepairProtocolMode, shipDriver: ShipDriver): number | undefined {
    const protocol = (repairProtocols as Record<string, RepairProtocolStats>)[protocolId];
    if (!protocol) {
        return undefined;
    }
    // dynamicDuration (e.g. armorPlateRenewal's GM-tweakable Armor.plateRepairSeconds) always
    // overrides the mode's static catalog number — same rule RepairManager.getDuration() applies.
    return protocol.dynamicDuration
        ? protocol.dynamicDuration(shipDriver.state)
        : getModeStats(protocol, mode).duration;
}

/** Tier, dark side effects and cells needed; `withDuration` prefixes the run time, for rows that have no time column. */
function protocolSummary(
    protocolId: string,
    mode: RepairProtocolMode,
    shipDriver: ShipDriver,
    withDuration: boolean,
): string {
    const protocol = (repairProtocols as Record<string, RepairProtocolStats>)[protocolId];
    if (!protocol) {
        return '';
    }
    const modeStats = getModeStats(protocol, mode);
    const darkSystems = modeStats.sideEffectSystems.length ? `, dark: ${modeStats.sideEffectSystems.join(', ')}` : '';
    // energyCells is finite (issue #2137) — shown so the crew can see how many jump-starts are
    // left before this protocol's priority can no longer be raised.
    const cells = protocol.consumesEnergyCell
        ? `, cells: ${shipDriver.state.reactor.energyCells}/${shipDriver.state.reactor.design.maxEnergyCells}`
        : '';
    const duration = withDuration ? `${protocolDuration(protocolId, mode, shipDriver)}s · ` : '';
    return `${duration}${protocol.tier}${darkSystems}${cells}`;
}

/**
 * Engineer damage-control panel (issue #2247): the "up next" order (issue #2434), then the active
 * repair (name, time remaining, progress), then one row per catalog protocol, titled by its raise key, — a fixed set, in catalog order — each showing its
 * priority (OFF/LOW/MEDIUM/HIGH/RUNNING/CANCELLING), progress while running, and the reason the
 * last priority change was refused. `slots` never grows or shrinks after ship construction, so
 * every row is built once; each blade live-binds its own field.
 *
 * `interactive` adds per-row raise/lower buttons for the GM screen (issue #2212's click path). The
 * engineer screen renders with `interactive: false` — hotkeys only, wired in `engineer-screen.ts`.
 */
export function drawRepairQueue(container: WidgetContainer, shipDriver: ShipDriver, interactive: boolean) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Repair Queue');
    const visibleSlots = shipDriver.state.repairQueue.slots
        .map((slot, index) => ({ slot, index }))
        // this ship structurally lacks the equipment this protocol needs (e.g. no chain gun) —
        // never shows, unlike a tier- or energy-cell-gated protocol, which stays visible and
        // explains itself through refusalReason (issue #2247 review)
        .filter(({ slot }) => isRepairSlotVisible(shipDriver.state, slot.protocolId));

    drawUpNext(pane, shipDriver, visibleSlots.length, panelCleanup.add);
    drawActiveRepair(
        pane,
        shipDriver,
        visibleSlots.map(({ index }) => index),
        panelCleanup.add,
    );
    for (const { slot, index } of visibleSlots) {
        drawSlot(pane, shipDriver, slot.protocolId, index, interactive, panelCleanup.add);
    }
}

/**
 * The queue in run order (issue #2434): one line per non-OFF slot — position, protocol, priority —
 * from `getRepairUpNext`, the same ordering the server promotes from. A fixed set of `rows` lines
 * (one per visible slot: at most that many can be non-OFF), each hidden while it has no entry.
 */
function drawUpNext(pane: Pane, shipDriver: ShipDriver, rows: number, cleanup: (d: Destructor) => void) {
    const slots = shipDriver.state.repairQueue.slots;
    const deps = [...slots].flatMap((_, index) => [
        readProp(shipDriver, `/repairQueue/slots/${index}/priority`),
        readProp(shipDriver, `/repairQueue/slots/${index}/queuedSeq`),
    ]);
    const upNext = () => getRepairUpNext(slots);
    for (let position = 1; position <= rows; position++) {
        const line = aggregate(deps, () => formatRepairUpNextEntry(upNext()[position - 1]));
        const blade = addTextBlade(pane, line, { label: String(position) }, cleanup);
        blade.element.classList.add('sw-up-next');
        hideWhile(blade.element, line, (text) => !text, cleanup);
    }
}

/** The repair now running (or winding down): its name, the time left, and how far along it is. */
function drawActiveRepair(pane: Pane, shipDriver: ShipDriver, slotIndexes: number[], cleanup: (d: Destructor) => void) {
    const slots = shipDriver.state.repairQueue.slots;
    const deps = [
        ...slotIndexes.flatMap((index) => [
            readProp(shipDriver, `/repairQueue/slots/${index}/priority`),
            readProp(shipDriver, `/repairQueue/slots/${index}/progress`),
            readProp(shipDriver, `/repairQueue/slots/${index}/mode`),
        ]),
        readProp(shipDriver, '/armor/plateRepairSeconds'),
    ];
    const active = () =>
        slotIndexes
            .map((index) => slots[index])
            .find((s) => s.priority === RepairPriority.RUNNING || s.priority === RepairPriority.CANCELLING);
    const remaining = () => {
        const slot = active();
        const duration = slot && protocolDuration(slot.protocolId, slot.mode, shipDriver);
        return slot?.priority === RepairPriority.RUNNING && duration !== undefined
            ? formatClock(duration * (1 - slot.progress))
            : '--:--';
    };
    addTextBlade(
        pane,
        aggregate(deps, () => {
            const slot = active();
            return slot ? protocolName(slot.protocolId) : '—';
        }),
        { label: 'active' },
        cleanup,
    ).element.classList.add('sw-mode');
    addTextBlade(pane, aggregate(deps, remaining), { label: 'remaining' }, cleanup);
    addBareBarBlade(pane, { ...aggregate(deps, () => active()?.progress ?? 0), range: [0, 1] as RTuple2 }, cleanup);
}

function drawSlot(
    pane: Pane,
    shipDriver: ShipDriver,
    protocolId: string,
    index: number,
    interactive: boolean,
    cleanup: (d: Destructor) => void,
) {
    const hotkeys = interactive ? '' : (getRepairProtocolHotkey(protocolId)?.toUpperCase() ?? '—');
    const row = pane.addFolder({ title: protocolName(protocolId) });
    cleanup(() => row.dispose());

    // reactor.energyCells, armor.plateRepairSeconds and this slot's own mode are the only
    // catalog-summary inputs that change live (a dynamicDuration protocol's duration, how many
    // jump-starts are left, or a field-tier row's Responsive/Dark price) — aggregate()
    // re-renders this text whenever any of them actually change value.
    const summaryInputs = [
        readProp(shipDriver, '/reactor/energyCells'),
        readProp(shipDriver, '/armor/plateRepairSeconds'),
        readProp(shipDriver, `/repairQueue/slots/${index}/mode`),
    ];
    const currentMode = () => shipDriver.state.repairQueue.slots[index]?.mode ?? RepairProtocolMode.Responsive;
    addTextBlade(
        row,
        aggregate(summaryInputs, () => {
            const summary = protocolSummary(protocolId, currentMode(), shipDriver, interactive);
            return hotkeys ? `${hotkeys} · ${summary}` : summary;
        }),
        { label: 'details' },
        cleanup,
    );
    if (!interactive) {
        showRunTime(row, summaryInputs, () => protocolDuration(protocolId, currentMode(), shipDriver), cleanup);
    }
    const priority = readProp<RepairPriority>(shipDriver, `/repairQueue/slots/${index}/priority`);
    const priorityBlade = addTextBlade(row, priority, { label: 'priority', format: formatPriority }, cleanup);
    const applyPriority = () => {
        const value = priority.getValue();
        priorityBlade.element.dataset.priority = value === undefined ? '' : formatPriority(value);
    };
    cleanup(priority.onChange(applyPriority));
    applyPriority();
    if (interactive) {
        const applyTitle = () => {
            row.title = repairSlotTitle(protocolName(protocolId), priority.getValue());
        };
        cleanup(priority.onChange(applyTitle));
        applyTitle();
    } else {
        showKeyAndPriority(row, getRepairProtocolKeyLabel(protocolId), priority, cleanup);
    }
    // a docked/shipyard-tier slot's `mode` field exists on the schema but is meaningless (see
    // RepairProtocolSlot.mode) — getRepairProtocolModeHotkey (and this row) only exist for a
    // field-tier protocol, the one kind that actually has two modes to show or toggle between.
    if (getRepairProtocolModeHotkey(protocolId)) {
        const modeBlade = addTextBlade(
            row,
            readProp<RepairProtocolMode>(shipDriver, `/repairQueue/slots/${index}/mode`),
            { label: 'mode', format: formatMode },
            cleanup,
        );
        if (!interactive) {
            // the details line already prices the current mode; this row would cost a line per slot
            modeBlade.element.classList.add('sw-visually-hidden');
        }
        if (interactive) {
            addButton(
                row,
                () => shipDriver.command(repairCommands.toggleRepairProtocolMode, { protocolId }),
                { label: '', title: 'Toggle Responsive/Dark mode' },
                cleanup,
            );
        }
    }
    const progress = readNumberProp(shipDriver, `/repairQueue/slots/${index}/progress`);
    const progressBlade = addBarBlade(
        row,
        progress,
        { label: 'progress', format: (p: number) => `${Math.round(p * 100)}%` },
        cleanup,
    );
    if (!interactive) {
        // an idle slot's empty bar says nothing, and the line it would take is needed by the other slots
        hideWhile(progressBlade.element, progress, (p) => !p, cleanup);
    }
    // during the grace window before a sustained shortfall force-stops the run
    // (RepairProtocolSlot.refusalReason only appears *after* that), this is the only visible
    // explanation for a progress bar that has stalled.
    const energyStarved = readProp<boolean>(shipDriver, `/repairQueue/slots/${index}/energyStarved`);
    const energyBlade = addTextBlade(
        row,
        energyStarved,
        { label: 'repair energy', format: (starved: boolean) => (starved ? 'insufficient reactor energy' : '') },
        cleanup,
    );
    const refusalReason = readProp<string>(shipDriver, `/repairQueue/slots/${index}/refusalReason`);
    const noticeBlade = addTextBlade(row, refusalReason, { label: 'notice' }, cleanup);
    if (!interactive) {
        // a display station has no room for two rows that are blank until something goes wrong
        hideWhile(energyBlade.element, energyStarved, (starved) => !starved, cleanup);
        // an input cannot wrap, so the reason shows in a wrapping line of its own (issue #2438)
        noticeBlade.element.classList.add('sw-visually-hidden');
        showNotice(row, refusalReason, cleanup);
        // collapsed unless running/cancelling or carrying a notice (plan card M3.11)
        let wasOpen: boolean | undefined;
        const applyExpansion = () => {
            const open = wantsRepairSlotOpen(priority.getValue(), refusalReason.getValue());
            const expanded = repairSlotExpansion(wasOpen, open);
            wasOpen = open;
            if (expanded !== undefined) {
                row.expanded = expanded;
            }
        };
        cleanup(priority.onChange(applyExpansion));
        cleanup(refusalReason.onChange(applyExpansion));
        applyExpansion();
    }
    if (interactive) {
        addButton(
            row,
            () => shipDriver.command(repairCommands.cycleRepairPriority, { protocolId, direction: 'up' }),
            { label: '', title: 'Raise priority' },
            cleanup,
        );
        addButton(
            row,
            () => shipDriver.command(repairCommands.cycleRepairPriority, { protocolId, direction: 'down' }),
            { label: '', title: 'Lower priority' },
            cleanup,
        );
    }
}

/** The run time sits at the right of the slot's title bar (`data-time`, see tweakpane.css); it changes with the mode or the armor plate time. */
function showRunTime(
    row: FolderApi,
    inputs: { onChange: (cb: () => void) => () => void }[],
    duration: () => number | undefined,
    cleanup: (d: Destructor) => void,
) {
    const titleBar = row.element.querySelector<HTMLElement>(':scope > .tp-fldv_b');
    const label = () => {
        const seconds = duration();
        return seconds === undefined ? '' : `${Math.round(seconds)}s`;
    };
    const apply = () => {
        if (titleBar) {
            titleBar.dataset.time = label();
        }
    };
    cleanup(aggregate(inputs, label).onChange(apply));
    apply();
}

/**
 * A display station's slot title bar (issue #2438): the slot's hotkey where a row number would sit
 * (`data-key`), the name, then the priority as a badge of its own so a long name truncates, never the priority.
 */
function showKeyAndPriority(
    row: FolderApi,
    key: string,
    priority: Model<RepairPriority>,
    cleanup: (d: Destructor) => void,
) {
    const titleBar = row.element.querySelector<HTMLElement>(':scope > .tp-fldv_b');
    if (!titleBar) {
        return;
    }
    titleBar.dataset.key = key;
    const badge = document.createElement('span');
    badge.className = 'sw-repair-badge';
    titleBar.querySelector(':scope > .tp-fldv_t')?.after(badge);
    const apply = () => {
        const value = priority.getValue();
        const text = value === undefined || value === RepairPriority.OFF ? '' : formatPriority(value);
        badge.textContent = text;
        badge.dataset.priority = text;
    };
    cleanup(priority.onChange(apply));
    apply();
}

/** The refusal reason as a wrapping line under the slot's details; absent while there is none. */
function showNotice(row: FolderApi, reason: Model<string>, cleanup: (d: Destructor) => void) {
    const notice = document.createElement('div');
    notice.className = 'sw-repair-notice';
    row.element.querySelector(':scope > .tp-fldv_c')?.append(notice);
    const apply = () => {
        notice.textContent = reason.getValue() ?? '';
        notice.hidden = !notice.textContent;
    };
    cleanup(reason.onChange(apply));
    apply();
}

function hideWhile<T>(
    element: HTMLElement,
    model: Model<T>,
    isBlank: (value: T | undefined) => boolean,
    cleanup: (d: Destructor) => void,
) {
    const apply = () => element.classList.toggle('sw-visually-hidden', isBlank(model.getValue()));
    cleanup(model.onChange(apply));
    apply();
}
