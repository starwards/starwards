import {
    Destructors,
    RepairOperationStatus,
    ShipDriver,
    getAvailableRepairProtocols,
    repairCommands,
    repairProtocols,
} from '@starwards/core';
import { addBarBlade, addButton, addTextBlade, createWidgetPane } from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { WidgetContainer } from '../container';

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
    // this build slice hardcodes the ship's repair tier to 'field' (SPEC-0003); docked/shipyard
    // protocols are refused server-side regardless, but hiding them here avoids a dead button.
    // getAvailableRepairProtocols also drops protocols that target equipment this ship doesn't
    // have fitted (e.g. no chain gun) — the server refuses those too, so hide them the same way.
    const availableProtocols = getAvailableRepairProtocols(shipDriver.state, repairProtocols);
    for (const [protocolId, protocol] of Object.entries(availableProtocols).filter(([, p]) => p.tier === 'field')) {
        addButton(
            catalogFolder,
            () => shipDriver.command(repairCommands.enqueueRepair, { protocolId }),
            { label: '', title: `${protocol.name} (${protocol.duration}s)` },
            panelCleanup.add,
        );
    }

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
