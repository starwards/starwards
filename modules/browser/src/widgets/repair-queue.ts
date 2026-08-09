import {
    Destructors,
    RepairOperationStatus,
    RepairProtocolStats,
    ShipDriver,
    getAvailableRepairProtocols,
    repairCommands,
    repairProtocols,
} from '@starwards/core';
import { addBarBlade, addButton, addTextBlade, createWidgetPane } from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { WidgetContainer } from '../container';

/**
 * ECR screen is the only bearer of engineering hotkeys and already exhausts the alphanumeric
 * keyboard on per-system power/coolant pairs (see `ecr.ts`'s `keyPairs`), so the catalog gets its
 * own modifier namespace rather than fighting over what's left. Alt (not Ctrl) specifically:
 * Ctrl+1..9 is bound to browser tab-switching in Chrome/Firefox and would never reach the page.
 * Assigned by fixed position in `repairProtocols` (not the per-ship filtered/visible subset), so a
 * protocol's key never shifts as tier/equipment availability changes it in and out of view — a
 * protocol *added* to the catalog does shift every key after it, same as inserting a row in the
 * middle of any position-indexed list; overflow past the digit row spills onto the qwerty row.
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

/** The hotkey assigned to `protocolId`, or `undefined` if the catalog has grown past `REPAIR_PROTOCOL_HOTKEYS`. */
export function getRepairProtocolHotkey(
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): string | undefined {
    const index = Object.keys(catalog).indexOf(protocolId);
    return index >= 0 ? REPAIR_PROTOCOL_HOTKEYS[index] : undefined;
}

function formatStatus(status: RepairOperationStatus): string {
    switch (status) {
        case RepairOperationStatus.QUEUED:
            return 'QUEUED';
        case RepairOperationStatus.ACTIVE:
            return 'ACTIVE';
        case RepairOperationStatus.DONE:
            return 'DONE';
        case RepairOperationStatus.CANCELLED:
            return 'CANCELLED';
        default:
            return String(status);
    }
}

function protocolName(protocolId: string): string {
    return (repairProtocols as Record<string, { name: string }>)[protocolId]?.name ?? protocolId;
}

/**
 * ECR damage-control queue: a catalog of repair protocols the Engineer can enqueue, and the live
 * queue (one active operation at a time) with per-operation cancel/reorder controls. Recently
 * finished operations (done or cancelled) show read-only for a few seconds so the crew can see the
 * outcome before the row disappears — see `RepairQueue.recentlyFinished`.
 */
export function drawRepairQueue(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Repair Queue');

    // a refused enqueue (unknown/unavailable/above-tier protocol, or a full queue) otherwise does
    // nothing visible — this surfaces the server's reason for a few seconds (RepairQueue.refusalReason)
    addTextBlade(
        pane,
        readProp<string>(shipDriver, '/repairQueue/refusalReason'),
        { label: 'notice' },
        panelCleanup.add,
    );

    const catalogFolder = pane.addFolder({ title: 'Enqueue' });
    panelCleanup.add(() => catalogFolder.dispose());
    // getAvailableRepairProtocols drops protocols above the repair tier live docking state
    // currently grants (see getEffectiveRepairTier) and protocols targeting equipment this ship
    // doesn't have fitted (e.g. no chain gun) — the server refuses those too, so hide them the
    // same way. Re-rendered on every docking-mode change so a docked-tier protocol appears or
    // disappears live as the ship docks/undocks, not only after a panel reload.
    let catalogSession = new Destructors();
    panelCleanup.add(() => catalogSession.destroy());
    function renderCatalog() {
        catalogSession.destroy();
        catalogSession = new Destructors();
        const availableProtocols = getAvailableRepairProtocols(shipDriver.state, repairProtocols);
        for (const [protocolId, protocol] of Object.entries(availableProtocols)) {
            // dynamicDuration (e.g. armorPlateRenewal's GM-tweakable Armor.plateRepairSeconds) always
            // overrides the static catalog number — same rule RepairManager.getDuration() applies.
            const duration = protocol.dynamicDuration ? protocol.dynamicDuration(shipDriver.state) : protocol.duration;
            const hotkey = getRepairProtocolHotkey(protocolId)?.toUpperCase();
            const darkSystems = protocol.sideEffectSystems.length
                ? `, dark: ${protocol.sideEffectSystems.join(', ')}`
                : '';
            // energyCells is finite (issue #2137) — shown so the crew can see how many jump-starts
            // are left before this protocol drops out of `availableProtocols` entirely.
            const cells = protocol.consumesEnergyCell
                ? `, cells: ${shipDriver.state.reactor.energyCells}/${shipDriver.state.reactor.design.maxEnergyCells}`
                : '';
            const summary = `${hotkey ?? '—'} · ${duration}s · ${protocol.tier}${darkSystems}${cells}`;
            // display-only readout (issue: catalog is not mouse-interactive) — enqueueing happens
            // via the hotkey wired in ecr.ts's wireInput, on the same InputManager as power/coolant
            addTextBlade(
                catalogFolder,
                { getValue: () => summary, onChange: () => () => undefined },
                { label: protocol.name },
                catalogSession.add,
            );
        }
    }
    shipDriver.events.on('/docking/mode', renderCatalog);
    shipDriver.events.on('/reactor/energyCells', renderCatalog);
    panelCleanup.add(() => {
        shipDriver.events.off('/docking/mode', renderCatalog);
        shipDriver.events.off('/reactor/energyCells', renderCatalog);
    });
    renderCatalog();

    const operations = () => shipDriver.state.repairQueue.operations;
    const recentlyFinished = () => shipDriver.state.repairQueue.recentlyFinished;

    let session = new Destructors();
    panelCleanup.add(() => session.destroy());

    function render() {
        session.destroy();
        session = new Destructors();
        operations().forEach((op, index) => {
            const row = pane.addFolder({ title: protocolName(op.protocolId) });
            session.add(() => row.dispose());
            addTextBlade(
                row,
                readProp<RepairOperationStatus>(shipDriver, `/repairQueue/operations/${index}/status`),
                { label: 'state', format: formatStatus },
                session.add,
            );
            addBarBlade(
                row,
                readNumberProp(shipDriver, `/repairQueue/operations/${index}/progress`),
                { label: 'progress', format: (p: number) => `${Math.round(p * 100)}%` },
                session.add,
            );
            addButton(
                row,
                () => shipDriver.command(repairCommands.cancelRepair, { operationId: op.id }),
                { label: '', title: 'Cancel' },
                session.add,
            );
            if (op.status === RepairOperationStatus.QUEUED) {
                if (index > 0) {
                    addButton(
                        row,
                        () =>
                            shipDriver.command(repairCommands.reorderRepair, { operationId: op.id, index: index - 1 }),
                        { label: '', title: 'Move up' },
                        session.add,
                    );
                }
                if (index < operations().length - 1) {
                    addButton(
                        row,
                        () =>
                            shipDriver.command(repairCommands.reorderRepair, { operationId: op.id, index: index + 1 }),
                        { label: '', title: 'Move down' },
                        session.add,
                    );
                }
            }
        });
        recentlyFinished().forEach((op, index) => {
            const row = pane.addFolder({ title: protocolName(op.protocolId) });
            session.add(() => row.dispose());
            addTextBlade(
                row,
                readProp<RepairOperationStatus>(shipDriver, `/repairQueue/recentlyFinished/${index}/status`),
                { label: 'state', format: formatStatus },
                session.add,
            );
        });
    }

    // each row's status TEXT and progress bar auto-update via their own live bindings, but the
    // Move up/Move down buttons are gated on `status === QUEUED` captured at render time (a plain
    // conditional, not a binding) — a QUEUED -> ACTIVE flip changes no ids, so status must be part
    // of the signature or a promoted row keeps stale buttons the server silently refuses
    const signature = () =>
        operations()
            .map((o) => `${o.id}:${o.status}`)
            .join(',') +
        '|' +
        recentlyFinished()
            .map((o) => o.id)
            .join(',');
    let lastSignature = '';
    const onQueueChange = () => {
        const current = signature();
        if (current !== lastSignature) {
            lastSignature = current;
            render();
        }
    };
    shipDriver.events.on('/repairQueue/operations', onQueueChange);
    shipDriver.events.on('/repairQueue/operations/**', onQueueChange);
    shipDriver.events.on('/repairQueue/recentlyFinished', onQueueChange);
    panelCleanup.add(() => {
        shipDriver.events.off('/repairQueue/operations', onQueueChange);
        shipDriver.events.off('/repairQueue/operations/**', onQueueChange);
        shipDriver.events.off('/repairQueue/recentlyFinished', onQueueChange);
    });
    onQueueChange();
}
