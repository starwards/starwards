import { Destructors, HullStatus, StatusTier } from '@starwards/core';
import { addTextBlade, createWidgetPane } from '../panel';

import { EmitterLoop } from '../loop';
import { WidgetContainer } from '../container';
import { propertyStub } from '../property-wrappers';

/** How each status tier lights its row (tweakpane.css `data-status`). */
const tierStatus: Record<StatusTier, 'OK' | 'WARN' | 'ERROR'> = {
    intact: 'OK',
    damaged: 'WARN',
    critical: 'ERROR',
    failing: 'ERROR',
};

/** The subject row's readout: where its values come from (live, or a snapshot's age). */
function sourceText(r: HullStatus): string {
    if (r.intel === 'PENDING') return '—';
    return r.intel === 'SNAPSHOT' ? `SNAP ${Math.round(r.ageSeconds ?? 0)}S` : 'LIVE';
}

type Line = { text: ReturnType<typeof propertyStub<string>>; element: HTMLElement };

/**
 * The Signals hull-status list (SPEC-0010): per ally and per ship scanned to SNAPSHOT or FULL, as
 * `rows` reads them (core `hullStatusList`), a subject row then its hull and capsule tiers, each lit
 * by tier. Never a number. Rows are rebuilt when the set of subjects changes, updated in place otherwise.
 */
export function drawHullStatus(container: WidgetContainer, rows: () => HullStatus[]) {
    const { pane, cleanup } = createWidgetPane(container, 'Hull Status');
    let session = new Destructors();
    cleanup.add(() => session.destroy());
    let signature: string | undefined;
    let lines: { subject: Line; hull: Line; capsule: Line }[] = [];

    const line = (label: string): Line => {
        const text = propertyStub('—');
        const blade = addTextBlade(pane, text, { label }, session.add);
        blade.element.classList.add('tp-rotv', 'readout', 'sw-mode');
        return { text, element: blade.element };
    };
    const show = (l: Line, tier: StatusTier | undefined) => {
        l.text.setValue(tier ? tier.toUpperCase() : '—');
        l.element.dataset.status = tier ? tierStatus[tier] : '';
    };

    const update = () => {
        const current = rows();
        const next = current.map((r) => `${r.allied ? 'A' : 'C'}${r.id}:${r.name}`).join(',');
        if (next !== signature) {
            signature = next;
            session.destroy();
            session = new Destructors();
            lines = current.map((r) => ({
                subject: line(`${r.allied ? 'ALLY' : 'TGT'} ${r.name}`),
                hull: line('· hull'),
                capsule: line('· capsule'),
            }));
            if (!current.length) {
                addTextBlade(pane, propertyStub('NO CONTACTS'), { label: '' }, session.add);
            }
        }
        current.forEach((r, i) => {
            lines[i].subject.text.setValue(sourceText(r));
            show(lines[i].hull, r.hull);
            show(lines[i].capsule, r.capsule);
        });
    };
    const loop = new EmitterLoop(200);
    cleanup.add(() => loop.stop());
    loop.onLoop(update);
    loop.start();
    update();
}
